import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FxRateService } from '../../fx/fx-rate.service';
import { BASE_CURRENCY } from '../../expenses/expenses.service';
import { ResolvedPeriod } from './period.util';

const TOP_STYLES = 8;
const RECENT_EVENTS = 8;

interface StyleRevenueRow {
  styleId: string;
  currency: string;
  revenue: number;
}

export interface TopStyle {
  styleId: string;
  displayName: string;
  count: number;
  revenue: number;
}

/**
 * Catálogo y actividad: qué estilos tiran del negocio, qué se ha movido en los
 * pedidos y si la sincronización con Shopify sigue viva.
 */
@Injectable()
export class ActivityStats {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fxRate: FxRateService,
  ) {}

  /**
   * Top de estilos ordenado por INGRESOS, no por uso.
   *
   * El dashboard anterior ordenaba por número de generaciones, lo que premiaba
   * al estilo con el que la gente juega y no al que compra. Se conserva el
   * conteo como dato secundario.
   */
  private async topStyles(period: ResolvedPeriod): Promise<TopStyle[]> {
    const [countGroups, revenueRows] = await Promise.all([
      this.prisma.generation.groupBy({
        by: ['styleId'],
        where: {
          isAdminTest: false,
          createdAt: { gte: period.from, lt: period.to },
        },
        _count: { _all: true },
      }),

      this.prisma.$queryRaw<StyleRevenueRow[]>`
        SELECT
          g.style_id AS "styleId",
          o.currency AS "currency",
          SUM(oi.total_price)::float AS "revenue"
        FROM order_items oi
        JOIN generations g ON g.id = oi.generation_id
        JOIN orders o ON o.id = oi.order_id
        WHERE o.shopify_created_at >= ${period.from}
          AND o.shopify_created_at < ${period.to}
          AND o.financial_status = 'paid'
        GROUP BY g.style_id, o.currency
      `,
    ]);

    const counts = new Map(
      countGroups.map((g) => [g.styleId, g._count._all] as const),
    );
    const revenue = new Map<string, number>();

    for (const row of revenueRows) {
      const amount = Number(row.revenue ?? 0);
      let base = amount;
      if (row.currency !== BASE_CURRENCY) {
        const converted = await this.fxRate.convert(
          amount,
          row.currency,
          BASE_CURRENCY,
        );
        base = converted ? converted.amount : amount;
      }
      revenue.set(row.styleId, (revenue.get(row.styleId) ?? 0) + base);
    }

    const styleIds = [...new Set([...counts.keys(), ...revenue.keys()])];
    if (styleIds.length === 0) return [];

    const styles = await this.prisma.style.findMany({
      where: { id: { in: styleIds } },
      select: { id: true, displayName: true },
    });
    const names = new Map(styles.map((s) => [s.id, s.displayName]));

    return styleIds
      .map((styleId) => ({
        styleId,
        displayName: names.get(styleId) ?? styleId,
        count: counts.get(styleId) ?? 0,
        revenue: revenue.get(styleId) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.count - a.count)
      .slice(0, TOP_STYLES);
  }

  private async recentEvents() {
    const events = await this.prisma.orderEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: RECENT_EVENTS,
      select: {
        id: true,
        orderId: true,
        eventType: true,
        fromStatus: true,
        toStatus: true,
        source: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
      },
    });

    return events.map(({ order, ...event }) => ({
      ...event,
      orderNumber: order.orderNumber,
    }));
  }

  private async syncHealth() {
    const dayAgo = new Date(Date.now() - 86_400_000);

    const [last, failedLast24h] = await Promise.all([
      this.prisma.syncLog.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { status: true, type: true, startedAt: true },
      }),
      this.prisma.syncLog.count({
        where: { status: 'failed', startedAt: { gte: dayAgo } },
      }),
    ]);

    return {
      lastStatus: last?.status ?? null,
      lastType: last?.type ?? null,
      lastStartedAt: last?.startedAt ?? null,
      failedLast24h,
    };
  }

  async collect(period: ResolvedPeriod) {
    const [topStyles, recentEvents, syncHealth] = await Promise.all([
      this.topStyles(period),
      this.recentEvents(),
      this.syncHealth(),
    ]);

    return { topStyles, recentEvents, syncHealth };
  }
}
