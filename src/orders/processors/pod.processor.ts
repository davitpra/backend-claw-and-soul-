import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ORDERS_QUEUE, ORDERS_JOB_NAMES } from '../constants/queues.constants';
import { PodService } from '../pod/pod.service';

interface PodSubmitJobData {
  orderItemId: string;
  force?: boolean;
  manual?: boolean;
}

interface PodSyncJobData {
  orderItemId: string;
}

@Processor(ORDERS_QUEUE)
export class PodProcessor extends WorkerHost {
  private readonly logger = new Logger(PodProcessor.name);

  constructor(private readonly podService: PodService) {
    super();
  }

  async process(job: Job<PodSubmitJobData | PodSyncJobData>): Promise<void> {
    if (job.name === ORDERS_JOB_NAMES.POD_SUBMIT) {
      const { orderItemId, force, manual } = job.data as PodSubmitJobData;
      this.logger.log(`Processing POD_SUBMIT for item ${orderItemId}`);
      await this.podService.submitItem(orderItemId, force, manual);
    } else if (job.name === ORDERS_JOB_NAMES.POD_SYNC) {
      const { orderItemId } = job.data as PodSyncJobData;
      this.logger.log(`Processing POD_SYNC for item ${orderItemId}`);
      await this.podService.syncItem(orderItemId);
    }
  }
}
