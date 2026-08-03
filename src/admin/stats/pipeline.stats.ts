import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolvedPeriod, deltaPct, safeRatio } from './period.util';

/** Una generación que lleva más de esto sin terminar está atascada, no en curso. */
const STUCK_AFTER_MINUTES = 30;

/**
 * Salud del pipeline de IA.
 *
 * Todas las cifras excluyen `isAdminTest`: las pruebas del panel no son negocio
 * y contaminaban la tasa de fallo y el top de estilos del dashboard anterior.
 */
@Injectable()
export class PipelineStats {
  constructor(private readonly prisma: PrismaService) {}

  private async failureRateBetween(from: Date, to: Date) {
    const groups = await this.prisma.generation.groupBy({
      by: ['status'],
      where: { isAdminTest: false, createdAt: { gte: from, lt: to } },
      _count: { _all: true },
    });

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const group of groups) {
      byStatus[group.status] = group._count._all;
      total += group._count._all;
    }

    const failed = byStatus.failed ?? 0;
    const ratio = safeRatio(failed, total);

    return {
      byStatus,
      total,
      failed,
      completed: byStatus.completed ?? 0,
      failureRate: ratio === null ? null : ratio * 100,
    };
  }

  async collect(period: ResolvedPeriod) {
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MINUTES * 60_000);

    const [current, previous, byTypeGroups, stuck, latency, costRows] =
      await Promise.all([
        this.failureRateBetween(period.from, period.to),
        this.failureRateBetween(period.prevFrom, period.prevTo),

        this.prisma.generation.groupBy({
          by: ['type'],
          where: {
            isAdminTest: false,
            createdAt: { gte: period.from, lt: period.to },
          },
          _count: { _all: true },
        }),

        // Foto del ahora, no de la ventana: una generación colgada hace tres
        // días sigue estando colgada aunque el periodo sea de 24h.
        this.prisma.generation.count({
          where: {
            isAdminTest: false,
            status: { in: ['pending', 'processing'] },
            createdAt: { lt: stuckBefore },
          },
        }),

        this.prisma.$queryRaw<{ avg: number | null; p95: number | null }[]>`
        SELECT
          AVG(processing_time_seconds)::float AS avg,
          PERCENTILE_CONT(0.95) WITHIN GROUP (
            ORDER BY processing_time_seconds
          )::float AS p95
        FROM generations
        WHERE created_at >= ${period.from}
          AND created_at < ${period.to}
          AND is_admin_test = false
          AND status = 'completed'
          AND processing_time_seconds IS NOT NULL
      `,

        // `amountBase` es nullable cuando no hubo conversión FX; un
        // `_sum` la ignoraría en silencio, así que se agrega en JS cayendo a
        // `amount` — mismo criterio que `ExpensesService.customerSummary`.
        this.prisma.expense.findMany({
          where: {
            category: { in: ['image_generation', 'image_upscale'] },
            createdAt: { gte: period.from, lt: period.to },
          },
          select: { amount: true, amountBase: true },
        }),
      ]);

    const byType = { image: 0, video: 0 };
    for (const group of byTypeGroups) {
      if (group.type === 'video') byType.video = group._count._all;
      else byType.image = group._count._all;
    }

    const totalCost = costRows.reduce(
      (acc, row) => acc + (row.amountBase?.toNumber() ?? row.amount.toNumber()),
      0,
    );

    return {
      total: current.total,
      completed: current.completed,
      failed: current.failed,
      byStatus: current.byStatus,
      failureRate: current.failureRate,
      failureRatePrev: previous.failureRate,
      totalDeltaPct: deltaPct(current.total, previous.total),
      stuck,
      stuckAfterMinutes: STUCK_AFTER_MINUTES,
      avgProcessingSeconds: latency[0]?.avg ?? null,
      p95ProcessingSeconds: latency[0]?.p95 ?? null,
      byType,
      generationCost: totalCost,
      costPerGeneration: safeRatio(totalCost, current.completed),
    };
  }
}
