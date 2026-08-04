import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FxRateService } from '../../fx/fx-rate.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { CreditEconomicsService } from '../../credits/credit-economics.service';
import { sumRevenueByCurrency } from '../../orders/revenue.util';
import { ResolvedPeriod, deltaPct, safeRatio } from './period.util';

/**
 * Bloque de dinero del dashboard: ingresos, costos, margen y el pasivo que
 * representan los créditos aún sin gastar.
 *
 * No reimplementa nada: los costos salen de `ExpensesService.globalSummary` y la
 * economía de créditos de `CreditEconomicsService.globalEconomics`, que ya son
 * la fuente de verdad de la página `/admin/expenses`. Así el dashboard y esa
 * página no pueden divergir.
 */
@Injectable()
export class MoneyStats {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fxRate: FxRateService,
    private readonly expenses: ExpensesService,
    private readonly creditEconomics: CreditEconomicsService,
  ) {}

  /** Ingresos de pedidos pagados en una ventana, ya convertidos a moneda base. */
  private async revenueBetween(from: Date, to: Date) {
    const groups = await this.prisma.order.groupBy({
      by: ['currency'],
      where: {
        shopifyCreatedAt: { gte: from, lt: to },
        financialStatus: 'paid',
      },
      _sum: { totalAmount: true },
      _count: { _all: true },
    });

    return sumRevenueByCurrency(groups, this.fxRate);
  }

  async collect(period: ResolvedPeriod) {
    const [current, previous, costs, economics] = await Promise.all([
      this.revenueBetween(period.from, period.to),
      this.revenueBetween(period.prevFrom, period.prevTo),
      this.expenses.globalSummary(period.key),
      this.creditEconomics.globalEconomics(period.key),
    ]);

    // Se conserva el `count` de cada categoría, no solo el total: es lo que deja
    // a `PipelineHealthCard` mostrar cuántos upscales hubo y a cuánto salió cada
    // uno sin abrir una consulta propia.
    const byCategory = costs.byCategory;

    const grossMargin = current.total - costs.grandTotal;
    const marginRatio = safeRatio(grossMargin, current.total);

    return {
      baseCurrency: current.baseCurrency,
      revenue: current.total,
      revenuePrev: previous.total,
      revenueDeltaPct: deltaPct(current.total, previous.total),
      orders: current.orderCount,
      ordersPrev: previous.orderCount,
      ordersDeltaPct: deltaPct(current.orderCount, previous.orderCount),
      aov: safeRatio(current.total, current.orderCount),
      // Monedas sumadas en crudo por falta de tipo de cambio. La UI lo muestra
      // como salvedad; sin esto el total parecería exacto cuando no lo es.
      unconvertedCurrencies: current.unconvertedCurrencies,
      costs: { total: costs.grandTotal, count: costs.count, byCategory },
      grossMargin,
      grossMarginPct: marginRatio === null ? null : marginRatio * 100,
      creditsIssued: economics.creditsIssued,
      creditsSpentNet: economics.creditsSpentNet,
      creditsOutstanding: economics.creditsOutstanding,
      creditLiability: economics.outstandingLiability,
      unitCost: economics.unitCost,
      unitCostSampleSize: economics.unitCostSampleSize,
      // Desglose de la tarifa unitaria; `null` si no hubo ninguna muestra.
      unitCostBreakdown: economics.unitCostBreakdown,
      // Si no coincide con el periodo pedido, la ventana no tuvo generaciones
      // con costo y la media salió de todo el histórico. La UI lo advierte.
      unitCostPeriod: economics.unitCostPeriod,
    };
  }
}
