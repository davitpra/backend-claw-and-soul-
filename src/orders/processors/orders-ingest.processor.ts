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

interface RefreshFulfillmentJobData {
  shopifyOrderId: string;
  topic: string;
}

@Processor(ORDERS_QUEUE)
export class OrdersIngestProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersIngestProcessor.name);

  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  async process(
    job: Job<IngestJobData | RefreshFulfillmentJobData>,
  ): Promise<void> {
    if (job.name === ORDERS_JOB_NAMES.INGEST) {
      const { payload, topic, webhookId } = job.data as IngestJobData;
      this.logger.log(
        `Processing order ingest: ${payload.name} (${payload.id}) topic=${topic}`,
      );
      await this.ordersService.ingestShopifyOrder(payload, webhookId, topic);
      return;
    }

    if (job.name === ORDERS_JOB_NAMES.REFRESH_FULFILLMENT) {
      const { shopifyOrderId, topic } = job.data as RefreshFulfillmentJobData;
      await this.ordersService.refreshFulfillmentDisplayStatus(
        shopifyOrderId,
        topic,
      );
      return;
    }
  }
}
