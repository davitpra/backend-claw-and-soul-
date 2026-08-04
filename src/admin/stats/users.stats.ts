import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FxRateService } from '../../fx/fx-rate.service';
import { BASE_CURRENCY } from '../../expenses/expenses.service';
import {
  RevenueCurrencyGroup,
  sumRevenueByCurrency,
} from '../../orders/revenue.util';
import { ResolvedPeriod, safeRatio } from './period.util';
import {
  CUSTOMER_ONLY_SQL,
  LAST_SEEN_SQL,
  NOT_DELETED_SQL,
} from './user-activity.util';

const DAY_MS = 86_400_000;

/** Cortes de recencia de la segmentación, en días. */
const RECENCY_DAYS = [7, 30, 90] as const;

/** Sin señales desde hace más de esto: dormido. Espejo del filtro de /admin/users. */
const DORMANT_AFTER_DAYS = 90;

interface SegmentRow {
  base: number;
  active7d: number;
  active30d: number;
  active90d: number;
  dormant: number;
  neverActivated: number;
}

interface RepeatRow {
  buyers: number;
  repeatBuyers: number;
}

type BuyerSegment = 'firstTime' | 'returning' | 'guest';

interface SegmentRevenueRow {
  segment: BuyerSegment;
  currency: string;
  count: number;
  revenue: number;
}

export interface UserRecencySegments {
  /** Clientes no dados de baja. Denominador de todos los porcentajes. */
  base: number;
  /** ACUMULATIVOS Y ANIDADOS: los de 7 d están dentro de los de 30 d. */
  active7d: number;
  active30d: number;
  active90d: number;
  /** Complemento exacto de `active90d`; incluye a quien nunca entró. */
  dormant: number;
  /**
   * Registrados sin mascota ni generación. CRUZA los otros buckets —se puede
   * estar activo y sin activar a la vez—, así que no suma con ellos.
   */
  neverActivated: number;
  active30dPct: number | null;
  dormantPct: number | null;
  neverActivatedPct: number | null;
  dormantAfterDays: number;
}

export interface UserRetention {
  /**
   * Acumulado, no del periodo: con una ventana de 3 días nadie recompra.
   * Solo cuenta pedidos enlazados a una cuenta, y no excluye a las cuentas
   * dadas de baja: quien compró dos veces y luego se dio de baja recompró.
   */
  buyers: number;
  repeatBuyers: number;
  repeatRatePct: number | null;
  /** Pedidos pagados DEL PERIODO, ya en moneda base. */
  revenueFirstTime: number;
  revenueReturning: number;
  revenueGuest: number;
  ordersFirstTime: number;
  ordersReturning: number;
  ordersGuest: number;
  /** Recurrentes ÷ (primera compra + recurrentes): los invitados no son ni una cosa ni la otra. */
  returningRevenuePct: number | null;
  baseCurrency: string;
  unconvertedCurrencies: string[];
}

export interface OverviewUsers {
  segments: UserRecencySegments;
  retention: UserRetention;
}

/**
 * Bloque de usuarios del dashboard: cómo está repartida la base por recencia y
 * cuánto del negocio viene de gente que vuelve.
 *
 * Tres consultas, todas de agregación pura: ninguna trae filas. La segmentación
 * se resuelve en un solo escaneo con `COUNT(*) FILTER` en vez de un `count()`
 * por bucket, porque cada bucket exigiría su propio semi-join contra sesiones.
 *
 * Los cortes de recencia son fijos (7/30/90 d) y NO dependen del periodo
 * elegido: es una foto de la base a día de hoy. Es lo único honesto, porque las
 * dos señales de actividad se pisan a sí mismas y no hay historia que consultar
 * hacia atrás.
 */
@Injectable()
export class UsersStats {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fxRate: FxRateService,
  ) {}

  async collect(period: ResolvedPeriod): Promise<OverviewUsers> {
    const now = Date.now();
    const [d7, d30, d90] = RECENCY_DAYS.map(
      (days) => new Date(now - days * DAY_MS),
    );

    const [segmentRows, repeatRows, revenueRows] = await Promise.all([
      // Los buckets se anidan (7 ⊂ 30 ⊂ 90) para que cada cifra se traduzca a un
      // filtro de /admin/users de una sola condición, en vez de un rango que la
      // lista no sabría expresar.
      this.prisma.$queryRaw<SegmentRow[]>`
        WITH signals AS (
          SELECT
            ${LAST_SEEN_SQL} AS last_seen,
            (
              NOT EXISTS (SELECT 1 FROM pets p WHERE p.user_id = u.id)
              AND NOT EXISTS (
                SELECT 1 FROM generations g
                WHERE g.user_id = u.id AND g.is_admin_test = false
              )
            ) AS never_activated
          FROM users u
          WHERE ${CUSTOMER_ONLY_SQL} AND ${NOT_DELETED_SQL}
        )
        SELECT
          COUNT(*)::int                                          AS "base",
          COUNT(*) FILTER (WHERE last_seen >= ${d7})::int         AS "active7d",
          COUNT(*) FILTER (WHERE last_seen >= ${d30})::int        AS "active30d",
          COUNT(*) FILTER (WHERE last_seen >= ${d90})::int        AS "active90d",
          COUNT(*) FILTER (WHERE last_seen <  ${d90})::int        AS "dormant",
          COUNT(*) FILTER (WHERE never_activated)::int            AS "neverActivated"
        FROM signals
      `,

      this.prisma.$queryRaw<RepeatRow[]>`
        WITH buyers AS (
          SELECT o.user_id, COUNT(*)::int AS paid_orders
          FROM orders o
          JOIN users u ON u.id = o.user_id
          WHERE o.financial_status = 'paid' AND ${CUSTOMER_ONLY_SQL}
          GROUP BY o.user_id
        )
        SELECT
          COUNT(*)::int                                    AS "buyers",
          COUNT(*) FILTER (WHERE paid_orders >= 2)::int    AS "repeatBuyers"
        FROM buyers
      `,

      // «Primera compra» mira si existe algún pedido pagado ANTERIOR a la
      // ventana, no si el usuario se dio de alta dentro de ella: son preguntas
      // distintas y mezclarlas haría que un usuario antiguo que por fin compra
      // contase como recurrente sin haber vuelto nunca.
      this.prisma.$queryRaw<SegmentRevenueRow[]>`
        SELECT
          CASE
            WHEN o.user_id IS NULL THEN 'guest'
            WHEN EXISTS (
              SELECT 1 FROM orders prev
              WHERE prev.user_id = o.user_id
                AND prev.financial_status = 'paid'
                AND prev.shopify_created_at < ${period.from}
            ) THEN 'returning'
            ELSE 'firstTime'
          END                             AS "segment",
          o.currency                      AS "currency",
          COUNT(*)::int                   AS "count",
          SUM(o.total_amount)::float      AS "revenue"
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        WHERE o.financial_status = 'paid'
          AND o.shopify_created_at >= ${period.from}
          AND o.shopify_created_at <  ${period.to}
          AND (o.user_id IS NULL OR ${CUSTOMER_ONLY_SQL})
        GROUP BY 1, 2
      `,
    ]);

    const segmentRow = segmentRows[0];
    const repeatRow = repeatRows[0];

    const [firstTime, returning, guest] = await Promise.all(
      (['firstTime', 'returning', 'guest'] as const).map((segment) =>
        this.sumSegment(revenueRows, segment),
      ),
    );

    const attributed = firstTime.total + returning.total;

    return {
      segments: {
        base: segmentRow.base,
        active7d: segmentRow.active7d,
        active30d: segmentRow.active30d,
        active90d: segmentRow.active90d,
        dormant: segmentRow.dormant,
        neverActivated: segmentRow.neverActivated,
        active30dPct: pct(segmentRow.active30d, segmentRow.base),
        dormantPct: pct(segmentRow.dormant, segmentRow.base),
        neverActivatedPct: pct(segmentRow.neverActivated, segmentRow.base),
        dormantAfterDays: DORMANT_AFTER_DAYS,
      },
      retention: {
        buyers: repeatRow.buyers,
        repeatBuyers: repeatRow.repeatBuyers,
        repeatRatePct: pct(repeatRow.repeatBuyers, repeatRow.buyers),
        revenueFirstTime: firstTime.total,
        revenueReturning: returning.total,
        revenueGuest: guest.total,
        ordersFirstTime: firstTime.orderCount,
        ordersReturning: returning.orderCount,
        ordersGuest: guest.orderCount,
        returningRevenuePct: pct(returning.total, attributed),
        baseCurrency: BASE_CURRENCY,
        unconvertedCurrencies: [
          ...new Set([
            ...firstTime.unconvertedCurrencies,
            ...returning.unconvertedCurrencies,
            ...guest.unconvertedCurrencies,
          ]),
        ],
      },
    };
  }

  /**
   * Convierte a moneda base los cubos de un segmento reutilizando el mismo
   * sumador que `MoneyStats`, para que los ingresos por segmento no puedan
   * divergir del KPI de ingresos por usar otra ruta de conversión.
   */
  private sumSegment(rows: SegmentRevenueRow[], segment: BuyerSegment) {
    const groups: RevenueCurrencyGroup[] = rows
      .filter((row) => row.segment === segment)
      .map((row) => ({
        currency: row.currency,
        _sum: { totalAmount: new Prisma.Decimal(row.revenue ?? 0) },
        _count: { _all: row.count },
      }));

    return sumRevenueByCurrency(groups, this.fxRate);
  }
}

/** Porcentaje protegido: `null` cuando no hay base, nunca `NaN`. */
function pct(numerator: number, denominator: number): number | null {
  const ratio = safeRatio(numerator, denominator);
  return ratio === null ? null : ratio * 100;
}
