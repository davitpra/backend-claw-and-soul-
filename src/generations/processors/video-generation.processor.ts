import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { GenerationsService } from '../generations.service';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queues.constants';

interface GenerateJobData {
  generationId: string;
}

@Processor(QUEUE_NAMES.VIDEO_GENERATION)
export class VideoGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoGenerationProcessor.name);

  constructor(private readonly generationsService: GenerationsService) {
    super();
  }

  async process(job: Job<GenerateJobData>): Promise<void> {
    if (job.name !== JOB_NAMES.GENERATE) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    const { generationId } = job.data;
    const startTime = Date.now();

    this.logger.log(`Processing video generation: ${generationId}`);
    await this.generationsService.updateGenerationStatus(generationId, 'processing');

    try {
      // TODO: Reemplazar con llamada real a proveedor de IA (Runway, etc.)
      await new Promise((resolve) => setTimeout(resolve, 8000));

      const processingTimeSeconds = Math.round((Date.now() - startTime) / 1000);

      await this.generationsService.updateGenerationStatus(generationId, 'completed', {
        resultUrl: `https://placeholder.example.com/videos/${generationId}.mp4`,
        resultStorageKey: `generations/${generationId}/result.mp4`,
        processingTimeSeconds,
      });

      this.logger.log(`Video generation completed: ${generationId} (${processingTimeSeconds}s)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Video generation failed: ${generationId}`, error instanceof Error ? error.stack : undefined);

      await this.generationsService.updateGenerationStatus(generationId, 'failed', {
        errorMessage,
      });

      throw error;
    }
  }
}
