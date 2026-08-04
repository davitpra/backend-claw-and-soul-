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
 *
 * Aquí NO se calcula ningún costo por generación. Antes había uno propio
 * —gasto de `image_generation` + `image_upscale` de la ventana dividido entre
 * las generaciones completadas— que contradecía al de `CreditsCard` por
 * construcción: numerador y denominador salían de tablas distintas, cortadas por
 * fechas distintas (el gasto se fecha al completarse, la generación por
 * `createdAt`), y el numerador incluía upscales que no son generaciones. La
 * cifra única vive en `CreditEconomicsService.sampleUnitCost` y llega a la UI
 * por `money.unitCost`; el gasto de upscale se muestra aparte desde
 * `money.costs.byCategory`.
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

    const [current, previous, byTypeGroups, stuck, latency] = await Promise.all(
      [
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
      ],
    );

    const byType = { image: 0, video: 0 };
    for (const group of byTypeGroups) {
      if (group.type === 'video') byType.video = group._count._all;
      else byType.image = group._count._all;
    }

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
    };
  }
}
