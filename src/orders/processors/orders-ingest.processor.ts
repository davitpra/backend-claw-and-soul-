import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ORDERS_QUEUE, ORDERS_JOB_NAMES } from '../constants/queues.constants';
import { OrdersService } from '../orders.service';
import { ShopifyOrderPayload } from '../dto/shopify-order.dto';

interface IngestJobData {
  payload: ShopifyOrderPayload;
  topic: string;
  webhookId?: string;
}

@Processor(ORDERS_QUEUE)
export class OrdersIngestProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersIngestProcessor.name);

  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  async process(job: Job<IngestJobData>): Promise<void> {
    if (job.name !== ORDERS_JOB_NAMES.INGEST) return;

    const { payload, topic, webhookId } = job.data;
    this.logger.log(
      `Processing order ingest: ${payload.name} (${payload.id}) topic=${topic}`,
    );

    await this.ordersService.ingestShopifyOrder(payload, webhookId, topic);
  }
}
