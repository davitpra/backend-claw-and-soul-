import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ORDERS_QUEUE,
  ORDERS_JOB_NAMES,
  ORDERS_JOB_OPTIONS,
} from '../constants/queues.constants';

@Injectable()
export class PodSyncService {
  private readonly logger = new Logger(PodSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(ORDERS_QUEUE) private readonly ordersQueue: Queue,
  ) {}

  /** Every 2 hours — enqueue POD_SYNC for all active POD items awaiting fulfillment. */
  @Cron('0 */2 * * *')
  async syncActivePodItems(): Promise<void> {
    this.logger.log('POD cron: scanning active POD items for status sync');

    const items = await this.prisma.orderItem.findMany({
      where: {
        fulfillmentMethod: 'pod',
        podOrderId: { not: null },
        productionStatus: 'in_production',
      },
      select: { id: true },
    });

    if (items.length === 0) {
      this.logger.debug('POD cron: no active items to sync');
      return;
    }

    for (const item of items) {
      await this.ordersQueue.add(
        ORDERS_JOB_NAMES.POD_SYNC,
        { orderItemId: item.id },
        { ...ORDERS_JOB_OPTIONS, attempts: 2 },
      );
    }

    this.logger.log(`POD cron: enqueued POD_SYNC for ${items.length} items`);
  }
}
