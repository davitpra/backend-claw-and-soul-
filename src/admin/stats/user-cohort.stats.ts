import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FxRateService } from '../../fx/fx-rate.service';
import { BASE_CURRENCY } from '../../expenses/expenses.service';
import { ResolvedPeriod, safeRatio } from './period.util';
import { CUSTOMER_ONLY_SQL, LAST_SEEN_SQL } from './user-activity.util';

/** Cuántas filas del ranking de valor se devuelven. */
const TOP_USERS = 8;

/** Por debajo de esta maduración, la cohorte todavía no significa gran cosa. */
export const MIN_COHORT_MATURITY_DAYS = 7;

interface CohortRow {
  signups: number;
  withPet: number;
  withGeneration: number;
  withPbn: number;
  withPaidOrder: number;
  returned: number;
}

interface TopRevenueRow {
  userId: string;
  currency: string;
  orders: number;
  revenue: number;
}

export interface ActivationCohort {
  /** Mismo criterio que `GrowthStats.newUsers`, o las dos cifras se contradicen. */
  signups: number;
  /** ACUMULATIVOS: cada escalón exige todos los anteriores. */
  withPet: number;
  withGeneration: number;
  withPbn: number;
  withPaidOrder: number;
  /** Dio señales de vida más de 24 h después del alta. */
  returned: number;
  returnedPct: number | null;
  activationPct: number | null;
  purchasePct: number | null;
  /** Días que ha tenido la cohorte más antigua para madurar. */
  maturityDays: number;
}

export interface TopUserRow {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  /** Su email ya no identifica a nadie: la UI no debe mostrarlo como contacto. */
  anonymized: boolean;
  revenue: number;
  orders: number;
  creditsSpent: number;
  generations: number;
}

export interface UsersDetailPayload {
  baseCurrency: string;
  cohort: ActivationCohort;
  topUsers: TopUserRow[];
  unconvertedCurrencies: string[];
}

/**
 * Cohorte de activación y ranking de valor del periodo.
 *
 * A diferencia del embudo de volumen, esta cohorte SÍ persigue al mismo usuario:
 * arranca de las altas de la ventana y comprueba escalón a escalón qué hizo cada
 * una. Los escalones se encadenan con `AND` para que el embudo no pueda subir;
 * el precio es que quien generó sin registrar mascota (`Generation.petId` es
 * nullable) se cae a partir del segundo escalón.
 *
 * Los hechos se cuentan hasta hoy, sin tope superior: quien se dio de alta el
 * día 1 y compró el día 25 cuenta como comprador. Acotarlos a la ventana haría
 * que la cohorte se viera estructuralmente peor cuanto más corto el periodo.
 */
@Injectable()
export class UserCohortStats {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fxRate: FxRateService,
  ) {}

  async collect(period: ResolvedPeriod): Promise<UsersDetailPayload> {
    const [cohortRows, revenueRows] = await Promise.all([
      this.prisma.$queryRaw<CohortRow[]>`
        WITH cohort AS (
          SELECT
            u.created_at,
            ${LAST_SEEN_SQL} AS last_seen,
            EXISTS (SELECT 1 FROM pets p WHERE p.user_id = u.id) AS has_pet,
            EXISTS (
              SELECT 1 FROM generations g
              WHERE g.user_id = u.id
                AND g.is_admin_test = false
                AND g.status = 'completed'
            ) AS has_generation,
            EXISTS (
              SELECT 1 FROM paint_by_numbers b
              WHERE b.user_id = u.id AND b.origin = 'customer'
            ) AS has_pbn,
            EXISTS (
              SELECT 1 FROM orders o
              WHERE o.user_id = u.id AND o.financial_status = 'paid'
            ) AS has_paid_order
          FROM users u
          WHERE ${CUSTOMER_ONLY_SQL}
            AND u.created_at >= ${period.from}
            AND u.created_at <  ${period.to}
        )
        SELECT
          COUNT(*)::int AS "signups",
          COUNT(*) FILTER (WHERE has_pet)::int AS "withPet",
          COUNT(*) FILTER (WHERE has_pet AND has_generation)::int AS "withGeneration",
          COUNT(*) FILTER (WHERE has_pet AND has_generation AND has_pbn)::int AS "withPbn",
          COUNT(*) FILTER (
            WHERE has_pet AND has_generation AND has_pbn AND has_paid_order
          )::int AS "withPaidOrder",
          COUNT(*) FILTER (
            WHERE last_seen > created_at + INTERVAL '1 day'
          )::int AS "returned"
        FROM cohort
      `,

      // Agrupado por moneda además de por usuario: cada pedido guarda la suya y
      // un `SUM` plano mezclaría divisas. La conversión y el orden final se
      // hacen en JS, ya con los cubos convertidos.
      this.prisma.$queryRaw<TopRevenueRow[]>`
        SELECT
          o.user_id                   AS "userId",
          o.currency                  AS "currency",
          COUNT(*)::int               AS "orders",
          SUM(o.total_amount)::float  AS "revenue"
        FROM orders o
        JOIN users u ON u.id = o.user_id
        WHERE o.financial_status = 'paid'
          AND o.shopify_created_at >= ${period.from}
          AND o.shopify_created_at <  ${period.to}
          AND ${CUSTOMER_ONLY_SQL}
        GROUP BY o.user_id, o.currency
      `,
    ]);

    const cohortRow = cohortRows[0];
    const { ranked, unconvertedCurrencies } =
      await this.rankByRevenue(revenueRows);
    const top = ranked.slice(0, TOP_USERS);
    const ids = top.map((row) => row.userId);

    const [profiles, credits, generations] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          anonymizedAt: true,
        },
      }),
      // Mismo criterio que `AdminUsersService.getCreditsSpent`: el gasto neto en
      // generaciones, sin bonos ni packs, que son saldo concedido y no consumo.
      this.prisma.creditTransaction.groupBy({
        by: ['userId'],
        where: {
          userId: { in: ids },
          reason: { in: ['generation_spend', 'generation_refund'] },
        },
        _sum: { amount: true },
      }),
      this.prisma.generation.groupBy({
        by: ['userId'],
        where: {
          userId: { in: ids },
          isAdminTest: false,
          createdAt: { gte: period.from, lt: period.to },
        },
        _count: { _all: true },
      }),
    ]);

    const byId = new Map(profiles.map((p) => [p.id, p]));
    const creditsById = new Map(
      credits.map((c) => [c.userId, -(c._sum.amount ?? 0)]),
    );
    const generationsById = new Map(
      generations.map((g) => [g.userId, g._count._all]),
    );

    const topUsers: TopUserRow[] = top.flatMap((row) => {
      const profile = byId.get(row.userId);
      if (!profile) return [];

      return [
        {
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
          status: profile.status,
          anonymized: profile.anonymizedAt !== null,
          revenue: row.revenue,
          orders: row.orders,
          creditsSpent: creditsById.get(profile.id) ?? 0,
          generations: generationsById.get(profile.id) ?? 0,
        },
      ];
    });

    return {
      baseCurrency: BASE_CURRENCY,
      cohort: {
        signups: cohortRow.signups,
        withPet: cohortRow.withPet,
        withGeneration: cohortRow.withGeneration,
        withPbn: cohortRow.withPbn,
        withPaidOrder: cohortRow.withPaidOrder,
        returned: cohortRow.returned,
        returnedPct: pct(cohortRow.returned, cohortRow.signups),
        activationPct: pct(cohortRow.withGeneration, cohortRow.signups),
        purchasePct: pct(cohortRow.withPaidOrder, cohortRow.signups),
        maturityDays: period.days,
      },
      topUsers,
      unconvertedCurrencies,
    };
  }

  /** Colapsa los cubos por moneda de cada usuario y ordena por ingreso convertido. */
  private async rankByRevenue(rows: TopRevenueRow[]) {
    const totals = new Map<string, { revenue: number; orders: number }>();
    const unconverted = new Set<string>();

    for (const row of rows) {
      const amount = row.revenue ?? 0;
      let converted = amount;

      if (row.currency !== BASE_CURRENCY) {
        const result = await this.fxRate.convert(
          amount,
          row.currency,
          BASE_CURRENCY,
        );
        if (result) converted = result.amount;
        else unconverted.add(row.currency);
      }

      const current = totals.get(row.userId) ?? { revenue: 0, orders: 0 };
      current.revenue += converted;
      current.orders += row.orders;
      totals.set(row.userId, current);
    }

    const ranked = [...totals.entries()]
      .map(([userId, value]) => ({ userId, ...value }))
      .sort((a, b) => b.revenue - a.revenue);

    return { ranked, unconvertedCurrencies: [...unconverted] };
  }
}

/** Porcentaje protegido: `null` cuando no hay base, nunca `NaN`. */
function pct(numerator: number, denominator: number): number | null {
  const ratio = safeRatio(numerator, denominator);
  return ratio === null ? null : ratio * 100;
}
