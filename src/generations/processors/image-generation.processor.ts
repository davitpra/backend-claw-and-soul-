import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Pet, PetPhoto, Format } from '@prisma/client';
import { GenerationsService } from '../generations.service';
import { StrategyRegistry } from '../pipeline/strategy.registry';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queues.constants';
import { StyleWithConfigs } from '../pipeline/pipeline.types';

interface GenerateJobData {
  generationId: string;
}

interface GenerationWithRelations {
  id: string;
  prompt: string | null;
  metadata: {
    compatConstraints?: Record<string, any>;
    userSelections?: Record<string, string | number>;
  } | null;
  style: StyleWithConfigs;
  pet: Pet;
  petPhoto: PetPhoto | null;
  format: Format | null;
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

      const constraints: Record<string, any> = {
        maxPets: 1,
        ...(generation.metadata?.compatConstraints ?? {}),
      };

      const result = await strategy.execute({
        generationId,
        petPhotoUrl,
        style: generation.style,
        pet: generation.pet,
        format: generation.format,
        constraints,
        userSelections: generation.metadata?.userSelections,
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
