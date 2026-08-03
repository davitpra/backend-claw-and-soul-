import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PRODUCTION_QUEUE_STATUSES } from '../../orders/production-status.util';
import { ResolvedPeriod } from './period.util';

/**
 * Bloque de operación: la lista de trabajo real del estudio.
 *
 * A diferencia del resto de bloques, la cola y los bloqueados **no se filtran
 * por periodo**: son una foto del ahora. Un item atascado desde hace cuatro
 * meses tiene que seguir viéndose aunque el selector diga "7 días".
 */
@Injectable()
export class ProductionStats {
  constructor(private readonly prisma: PrismaService) {}

  async collect(period: ResolvedPeriod) {
    const [
      queueGroups,
      methodGroups,
      artFailed,
      onHold,
      pendingPaid,
      oldest,
      shipped,
      delivered,
    ] = await Promise.all([
      this.prisma.orderItem.groupBy({
        by: ['productionStatus'],
        where: { productionStatus: { in: PRODUCTION_QUEUE_STATUSES } },
        _count: { _all: true },
      }),

      this.prisma.orderItem.groupBy({
        by: ['fulfillmentMethod'],
        where: { productionStatus: { in: PRODUCTION_QUEUE_STATUSES } },
        _count: { _all: true },
      }),

      this.prisma.orderItem.count({
        where: { productionStatus: 'art_failed' },
      }),
      this.prisma.orderItem.count({ where: { productionStatus: 'on_hold' } }),

      // Item en estado temprano de "pago pendiente" cuya orden SÍ está pagada:
      // la auto-asignación debería haberlo movido y no lo hizo.
      this.prisma.orderItem.count({
        where: {
          productionStatus: 'pending',
          order: { financialStatus: 'paid' },
        },
      }),

      this.prisma.orderItem.findFirst({
        where: { productionStatus: { in: PRODUCTION_QUEUE_STATUSES } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      this.prisma.orderItem.count({
        where: { shippedAt: { gte: period.from, lt: period.to } },
      }),
      this.prisma.orderItem.count({
        where: { deliveredAt: { gte: period.from, lt: period.to } },
      }),
    ]);

    const queue: Record<string, number> = {};
    let queueTotal = 0;
    for (const status of PRODUCTION_QUEUE_STATUSES) {
      queue[status] = 0;
    }
    for (const group of queueGroups) {
      queue[group.productionStatus] = group._count._all;
      queueTotal += group._count._all;
    }

    const byMethod = { in_house: 0, pod: 0 };
    for (const group of methodGroups) {
      if (group.fulfillmentMethod === 'pod') byMethod.pod = group._count._all;
      else byMethod.in_house = group._count._all;
    }

    return {
      queue,
      queueTotal,
      byMethod,
      oldestQueuedAt: oldest?.createdAt ?? null,
      blocked: { artFailed, onHold, pendingPaid },
      shipped,
      delivered,
    };
  }
}
