import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { GenerationsService } from '../generations.service';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queues.constants';

interface GenerateJobData {
  generationId: string;
}

@Processor(QUEUE_NAMES.IMAGE_GENERATION)
export class ImageGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageGenerationProcessor.name);

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

    this.logger.log(`Processing image generation: ${generationId}`);
    await this.generationsService.updateGenerationStatus(generationId, 'processing');

    try {
      // TODO: Reemplazar con llamada real a proveedor de IA (OpenAI, Stability AI, etc.)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const processingTimeSeconds = Math.round((Date.now() - startTime) / 1000);

      await this.generationsService.updateGenerationStatus(generationId, 'completed', {
        resultUrl: `https://placeholder.example.com/images/${generationId}.png`,
        resultStorageKey: `generations/${generationId}/result.png`,
        processingTimeSeconds,
      });

      this.logger.log(`Image generation completed: ${generationId} (${processingTimeSeconds}s)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Image generation failed: ${generationId}`, error instanceof Error ? error.stack : undefined);

      await this.generationsService.updateGenerationStatus(generationId, 'failed', {
        errorMessage,
      });

      throw error;
    }
  }
}
