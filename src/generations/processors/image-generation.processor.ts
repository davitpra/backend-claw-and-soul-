import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Style, Pet, PetPhoto } from '@prisma/client';
import { GenerationsService } from '../generations.service';
import { StrategyRegistry } from '../pipeline/strategy.registry';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queues.constants';

interface GenerateJobData {
  generationId: string;
}

interface GenerationWithRelations {
  id: string;
  prompt: string | null;
  style: Style;
  pet: Pet;
  petPhoto: PetPhoto | null;
}

@Processor(QUEUE_NAMES.IMAGE_GENERATION)
export class ImageGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageGenerationProcessor.name);

  constructor(
    private readonly generationsService: GenerationsService,
    private readonly strategyRegistry: StrategyRegistry,
  ) {
    super();
  }

  async process(job: Job<GenerateJobData>): Promise<void> {
    if (job.name !== JOB_NAMES.GENERATE) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    const { generationId } = job.data;
    this.logger.log(`Processing image generation: ${generationId}`);

    const raw = await this.generationsService.findForProcessing(generationId);
    const generation = raw as unknown as GenerationWithRelations;

    await this.generationsService.updateGenerationStatus(
      generationId,
      'processing',
    );

    try {
      const petPhotoUrl = generation.petPhoto?.photoUrl ?? '';
      if (!petPhotoUrl) {
        throw new Error('No pet photo URL available for generation');
      }

      const strategy = this.strategyRegistry.get(generation.style.strategyKey);

      const result = await strategy.execute({
        generationId,
        petPhotoUrl,
        style: generation.style,
        pet: generation.pet,
        userPrompt: generation.prompt ?? undefined,
      });

      await this.generationsService.markCompleted(generationId, result);
      this.logger.log(
        `Image generation completed: ${generationId} (${result.processingTimeSeconds}s)`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Image generation failed: ${generationId}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.generationsService.markFailed(generationId, errorMessage);
      throw error;
    }
  }
}
