import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Pet, PetPhoto, Format } from '@prisma/client';
import { GenerationsService } from '../generations.service';
import { StrategyRegistry } from '../pipeline/strategy.registry';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queues.constants';
import { StyleWithConfigs } from '../pipeline/pipeline.types';
import { PrismaService } from '../../prisma/prisma.service';

interface GenerateJobData {
  generationId: string;
}

interface AdminTestMetadata {
  petContext?: { petName?: string; petSpecies?: string; petBreed?: string };
  inputPhotoUrl?: string;
  inputStorageKey?: string;
  isAdminTest?: boolean;
  compatConstraints?: Record<string, any>;
  userSelections?: Record<string, string | number>;
}

interface GenerationWithRelations {
  id: string;
  styleId: string;
  isAdminTest: boolean;
  prompt: string | null;
  metadata: AdminTestMetadata | null;
  style: StyleWithConfigs;
  pet: Pet | null;
  petPhoto: PetPhoto | null;
  format: Format | null;
}

@Processor(QUEUE_NAMES.IMAGE_GENERATION)
export class ImageGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageGenerationProcessor.name);

  constructor(
    private readonly generationsService: GenerationsService,
    private readonly strategyRegistry: StrategyRegistry,
    private readonly prisma: PrismaService,
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
      const metadata = generation.metadata;

      let petPhotoUrl = generation.petPhoto?.photoUrl ?? '';
      if (!petPhotoUrl && metadata?.inputPhotoUrl) {
        petPhotoUrl = metadata.inputPhotoUrl;
      }
      if (!petPhotoUrl) {
        throw new Error('No pet photo URL available for generation');
      }

      const petContext = generation.pet ?? {
        name: metadata?.petContext?.petName ?? 'Test Pet',
        species: metadata?.petContext?.petSpecies ?? 'dog',
        breed: metadata?.petContext?.petBreed ?? null,
      };

      const strategy = this.strategyRegistry.get(generation.style.strategyKey);

      const constraints: Record<string, any> = {
        maxPets: 1,
        ...(metadata?.compatConstraints ?? {}),
      };

      const result = await strategy.execute({
        generationId,
        petPhotoUrl,
        style: generation.style,
        pet: petContext as Pet,
        format: generation.format,
        constraints,
        userSelections: metadata?.userSelections,
      });

      await this.generationsService.markCompleted(generationId, result);
      this.logger.log(
        `Image generation completed: ${generationId} (${result.processingTimeSeconds}s)`,
      );

      if (generation.isAdminTest) {
        const lastImage = await this.prisma.styleImage.findFirst({
          where: { styleId: generation.styleId },
          orderBy: { orderIndex: 'desc' },
          select: { orderIndex: true },
        });
        const nextOrderIndex = (lastImage?.orderIndex ?? -1) + 1;
        await this.prisma.styleImage.create({
          data: {
            styleId: generation.styleId,
            imageUrl: result.resultUrl,
            storageKey: result.resultStorageKey,
            altImage: `Test admin · ${new Date().toISOString().slice(0, 10)}`,
            orderIndex: nextOrderIndex,
            isPrimary: false,
          },
        });
        this.logger.log(
          `StyleImage created from admin test generation: ${generationId}`,
        );
      }
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
