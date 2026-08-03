import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BASE_CURRENCY } from '../expenses/expenses.service';

export type EconomicsPeriod = '3d' | '7d' | '30d' | '90d' | 'all';

/**
 * Une los dos libros mayores del sistema: el de créditos (`CreditTransaction`)
 * y el de dinero (`Expense`). Como un crédito se gasta en exactamente una
 * generación y cada generación completada deja un `Expense` de categoría
 * `image_generation`, el costo medio de esos gastos ES el costo de un crédito.
 *
 * Sesgos conocidos de la cifra (viven en `Expense`, no aquí; no se corrigen en
 * este servicio, pero conviene no leer el número como exacto):
 *  1. Un modelo sin tarifa se auto-registra a 0 en `ProviderRateService`
 *     (`getRateOrEnsure`) → sesga el costo medio a la BAJA.
 *  2. Con `MOCK_AI=true` se registra igualmente el precio de `fal-ai/flux/dev`
 *     por una generación que nunca llamó al proveedor → sesga al ALZA.
 *  3. Las generaciones fallidas no dejan `Expense` aunque la llamada a fal ya
 *     estuviese pagada, y encima devuelven el crédito → sesga a la BAJA.
 */
@Injectable()
export class CreditEconomicsService {
  constructor(private readonly prisma: PrismaService) {}

  private sinceFor(period: EconomicsPeriod): Date | undefined {
    if (period === 'all') return undefined;
    const days = parseInt(period.replace('d', ''), 10);
    return new Date(Date.now() - days * 86400000);
  }

  /**
   * Costo medio por generación en moneda base, con su desglose vision/imagen.
   *
   * Se lee con `findMany` en vez de `groupBy({ _sum: { amountBase } })` porque
   * las filas sin conversión FX tienen `amountBase` nulo y un `_sum` las
   * ignoraría en silencio: se cae a `amount`, igual que `customerSummary`.
   */
  private async sampleUnitCost(since?: Date) {
    const rows = await this.prisma.expense.findMany({
      where: {
        category: 'image_generation',
        generationId: { not: null },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: { amount: true, amountBase: true, fxRate: true, detail: true },
    });

    if (rows.length === 0) {
      return { unitCost: null, sampleSize: 0, breakdown: null };
    }

    type CostDetail = {
      vision?: { cost?: number };
      image?: { cost?: number };
    } | null;

    let total = 0;
    let vision = 0;
    let image = 0;

    for (const row of rows) {
      total += row.amountBase?.toNumber() ?? row.amount.toNumber();

      // `detail` guarda los costos en la moneda original del gasto (USD para
      // fal); el `fxRate` de la propia fila los lleva a base.
      const fx = row.fxRate?.toNumber() ?? 1;
      const detail = row.detail as CostDetail;
      vision += (detail?.vision?.cost ?? 0) * fx;
      image += (detail?.image?.cost ?? 0) * fx;
    }

    return {
      unitCost: total / rows.length,
      sampleSize: rows.length,
      breakdown: {
        vision: vision / rows.length,
        image: image / rows.length,
      },
    };
  }

  /** Consumo neto en generaciones: los spend netean con los refund. */
  private async creditsSpentNet(where: Prisma.CreditTransactionWhereInput) {
    const { _sum } = await this.prisma.creditTransaction.aggregate({
      where: {
        ...where,
        reason: { in: ['generation_spend', 'generation_refund'] },
      },
      _sum: { amount: true },
    });
    return -(_sum.amount ?? 0);
  }

  async globalEconomics(period: EconomicsPeriod = 'all') {
    const since = this.sinceFor(period);

    const [sample, issued, spentNet, outstanding] = await Promise.all([
      this.sampleUnitCost(since),
      this.prisma.creditTransaction.aggregate({
        where: {
          amount: { gt: 0 },
          ...(since ? { createdAt: { gte: since } } : {}),
        },
        _sum: { amount: true },
      }),
      this.creditsSpentNet(since ? { createdAt: { gte: since } } : {}),
      this.prisma.user.aggregate({
        where: { generationCredits: { gt: 0 } },
        _sum: { generationCredits: true },
      }),
    ]);

    // Un período corto puede no tener ni una generación con gasto; antes de
    // dejar el pasivo en blanco se reintenta sobre todo el histórico.
    let unitCostPeriod: EconomicsPeriod = period;
    let cost = sample;
    if (cost.unitCost === null && since) {
      cost = await this.sampleUnitCost(undefined);
      unitCostPeriod = 'all';
    }

    const creditsOutstanding = outstanding._sum.generationCredits ?? 0;

    return {
      period,
      baseCurrency: BASE_CURRENCY,
      unitCost: cost.unitCost,
      unitCostSampleSize: cost.sampleSize,
      unitCostPeriod,
      unitCostBreakdown: cost.breakdown,
      creditsIssued: issued._sum.amount ?? 0,
      creditsSpentNet: spentNet,
      // Foto del momento: nunca se filtra por período, a diferencia del resto.
      creditsOutstanding,
      outstandingLiability: creditsOutstanding * (cost.unitCost ?? 0),
    };
  }

  async userEconomics(userId: string) {
    const [user, spentNet, expenses, global] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { generationCredits: true },
      }),
      this.creditsSpentNet({ userId }),
      this.prisma.expense.findMany({
        where: { userId, category: 'image_generation' },
        select: { amount: true, amountBase: true },
      }),
      this.globalEconomics('all'),
    ]);

    const balance = user?.generationCredits ?? 0;
    const generationCost = expenses.reduce(
      (acc, row) => acc + (row.amountBase?.toNumber() ?? row.amount.toNumber()),
      0,
    );

    return {
      baseCurrency: BASE_CURRENCY,
      balance,
      creditsSpentNet: spentNet,
      generationCost,
      generationCount: expenses.length,
      avgCostPerCredit: expenses.length
        ? generationCost / expenses.length
        : null,
      // El saldo se valora con el costo medio GLOBAL: la media propia de un
      // cliente con dos generaciones no significa nada.
      unitCost: global.unitCost,
      unitCostSampleSize: global.unitCostSampleSize,
      // Un saldo negativo (posible tras una reversa) no es un pasivo.
      outstandingLiability: Math.max(balance, 0) * (global.unitCost ?? 0),
    };
  }
}
