import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { CreateImageGenerationDto } from './dto/create-image-generation.dto';
import { UpdateGenerationFlagsDto } from './dto/update-generation-flags.dto';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';
import { QUEUE_NAMES, JOB_NAMES } from './constants/queues.constants';
import { ExpensesService } from '../expenses/expenses.service';
import {
  computeAutoEarlyStatus,
  EARLY_AUTO_STATUSES,
} from '../orders/production-status.util';

@Injectable()
export class GenerationsService {
  private readonly logger = new Logger(GenerationsService.name);

  constructor(
    private prisma: PrismaService,
    private petsService: PetsService,
    @InjectQueue(QUEUE_NAMES.IMAGE_GENERATION) private imageQueue: Queue,
    private expensesService: ExpensesService,
  ) {}

  async createImageGeneration(
    userId: string,
    createDto: CreateImageGenerationDto,
  ) {
    // Validate pet ownership
    const pet = await this.petsService.findOne(createDto.petId);
    if (pet.userId !== userId) {
      throw new BadRequestException('Pet does not belong to user');
    }

    // Require at least one photo; the pipeline decides how many it uses.
    if (!pet.photos || pet.photos.length === 0) {
      throw new BadRequestException(
        'Pet must have at least one photo to generate',
      );
    }

    // Validate pet photo belongs to pet and has a URL
    const petPhoto = await this.prisma.petPhoto.findUnique({
      where: { id: createDto.petPhotoId },
    });
    if (!petPhoto || petPhoto.petId !== createDto.petId) {
      throw new BadRequestException(
        'Pet photo not found or does not belong to pet',
      );
    }
    if (!petPhoto.photoUrl) {
      throw new BadRequestException('Pet photo has no URL');
    }

    // Resolve product and derive styleId from it
    const product = await this.prisma.productReference.findUnique({
      where: { id: createDto.productRefId },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found or inactive');
    }
    if (!product.styleId) {
      throw new BadRequestException(
        'This product has no style assigned yet. An admin must link it to a style before it can be used for generation.',
      );
    }

    // Load style to validate userSelections against templateVarOptions
    const style = await this.prisma.style.findUnique({
      where: { id: product.styleId },
      select: { templateVarOptions: true },
    });

    const validatedSelections = this.validateUserSelections(
      createDto.userSelections ?? {},
      (style?.templateVarOptions ?? null) as Record<string, any> | null,
    );

    // Validate the requested format is available for this product
    const variant = await this.prisma.productFormatVariant.findFirst({
      where: {
        productRefId: createDto.productRefId,
        formatId: createDto.formatId,
        isActive: true,
      },
    });
    if (!variant) {
      throw new BadRequestException(
        'The requested format is not available for this product.',
      );
    }

    // Create generation record (no credit checks - all generations are free)
    const generation = await this.prisma.generation.create({
      data: {
        userId,
        petId: createDto.petId,
        petPhotoId: createDto.petPhotoId,
        styleId: product.styleId,
        formatId: createDto.formatId,
        productRefId: createDto.productRefId,
        type: 'image',
        status: 'pending',
        prompt: createDto.prompt || `${pet.species} ${pet.breed || ''}`,
        negativePrompt: createDto.negativePrompt,
        provider: createDto.provider || 'openai',
        metadata: {
          width: createDto.width || 1024,
          height: createDto.height || 1024,
          compatConstraints: variant.constraints ?? {},
          userSelections: validatedSelections,
        },
      },
      include: {
        pet: true,
        style: true,
      },
    });

    this.logger.log(`Image generation created: ${generation.id}`);

    await this.imageQueue.add(JOB_NAMES.GENERATE, {
      generationId: generation.id,
    });

    return generation;
  }

  async findUserGenerations(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
    petId?: string,
  ) {
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.GenerationWhereInput = { userId, type: 'image' };
    if (status) where.status = status;
    if (petId) where.petId = petId;

    const [generations, total] = await Promise.all([
      this.prisma.generation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          pet: true,
          style: true,
        },
      }),
      this.prisma.generation.count({ where }),
    ]);

    return createPaginatedResult(generations, total, page, limit);
  }

  async findOne(id: string, userId?: string) {
    const generation = await this.prisma.generation.findUnique({
      where: { id },
      include: {
        pet: true,
        style: true,
      },
    });

    if (!generation) {
      throw new NotFoundException('Generation not found');
    }

    if (userId && generation.userId !== userId && !generation.isPublic) {
      throw new BadRequestException('Access denied');
    }

    return generation;
  }

  async updateGenerationStatus(
    generationId: string,
    status: string,
    data?: Prisma.GenerationUpdateInput,
  ) {
    return this.prisma.generation.update({
      where: { id: generationId },
      data: {
        status,
        ...data,
        ...(status === 'completed' && { completedAt: new Date() }),
      },
    });
  }

  async getGenerationStatus(id: string, userId: string) {
    const generation = await this.prisma.generation.findUnique({
      where: { id },
      select: {
        status: true,
        userId: true,
        metadata: true,
        errorMessage: true,
      },
    });

    if (!generation) {
      throw new NotFoundException('Generation not found');
    }

    if (generation.userId !== userId) {
      throw new BadRequestException('Access denied');
    }

    const metadata = generation.metadata as Record<string, unknown> | null;
    return {
      status: generation.status,
      progress: (metadata?.progress ?? null) as number | null,
      errorMessage: generation.errorMessage ?? null,
    };
  }

  async updateGenerationFlags(
    id: string,
    userId: string,
    updateDto: UpdateGenerationFlagsDto,
  ) {
    const generation = await this.findOne(id, userId);

    if (generation.userId !== userId) {
      throw new BadRequestException('Access denied');
    }

    return this.prisma.generation.update({
      where: { id },
      data: {
        ...(updateDto.isPublic !== undefined && {
          isPublic: updateDto.isPublic,
        }),
        ...(updateDto.isFavorite !== undefined && {
          isFavorite: updateDto.isFavorite,
        }),
      },
    });
  }

  async deleteGeneration(id: string, userId: string) {
    const generation = await this.findOne(id, userId);

    if (generation.userId !== userId) {
      throw new BadRequestException('Access denied');
    }

    return this.prisma.generation.delete({
      where: { id },
    });
  }

  async findForProcessing(generationId: string) {
    const generation = await this.prisma.generation.findUnique({
      where: { id: generationId },
      include: {
        style: { include: { visionConfig: true, imageGenConfig: true } },
        pet: {
          include: {
            photos: { orderBy: [{ isPrimary: 'desc' }, { orderIndex: 'asc' }] },
          },
        },
        petPhoto: true,
        format: true,
      },
    });

    if (!generation) {
      throw new NotFoundException(`Generation ${generationId} not found`);
    }

    return generation;
  }

  async markCompleted(
    generationId: string,
    data: {
      visionAnalysis?: Record<string, any>;
      finalPrompt: string;
      falRequestId: string;
      resultUrl: string;
      resultStorageKey: string;
      processingTimeSeconds: number;
      promptSnapshot?: Record<string, any>;
    },
  ) {
    const updated = await this.prisma.generation.update({
      where: { id: generationId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        resultUrl: data.resultUrl,
        resultStorageKey: data.resultStorageKey,
        finalPrompt: data.finalPrompt,
        falRequestId: data.falRequestId,
        processingTimeSeconds: data.processingTimeSeconds,
        visionAnalysis: data.visionAnalysis ?? undefined,
        promptSnapshot: data.promptSnapshot ?? undefined,
      },
    });

    this.expensesService.recordGenerationCost(generationId).catch((err) => {
      this.logger.warn(
        `Failed to record generation cost for ${generationId}: ${(err as Error).message}`,
      );
    });

    await this.syncLinkedOrderItems(generationId, 'completed');

    return updated;
  }

  /**
   * Tras un cambio de estado de la generación, recomputa el `productionStatus`
   * de los OrderItem enlazados que sigan en un estado temprano auto-gestionado
   * (pago + arte). No pisa items que el admin ya avanzó manualmente. Best-effort:
   * un fallo aquí no debe romper la finalización de la generación.
   */
  private async syncLinkedOrderItems(
    generationId: string,
    generationStatus: string,
  ): Promise<void> {
    try {
      const items = await this.prisma.orderItem.findMany({
        where: {
          generationId,
          productionStatus: { in: EARLY_AUTO_STATUSES },
        },
        select: {
          id: true,
          productionStatus: true,
          order: { select: { financialStatus: true } },
        },
      });
      for (const item of items) {
        const next = computeAutoEarlyStatus(
          item.order.financialStatus,
          generationStatus,
        );
        if (next === item.productionStatus) continue;
        await this.prisma.orderItem.update({
          where: { id: item.id },
          data: { productionStatus: next },
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to sync order items for generation ${generationId}: ${(err as Error).message}`,
      );
    }
  }

  private validateUserSelections(
    userSelections: Record<string, string | number>,
    templateVarOptions: Record<string, any> | null,
  ): Record<string, string | number> {
    if (!templateVarOptions || Object.keys(templateVarOptions).length === 0) {
      return {};
    }

    const result: Record<string, string | number> = {};

    for (const [key, optDef] of Object.entries(templateVarOptions)) {
      const rawValue = userSelections[key];

      if (rawValue === undefined || rawValue === null) {
        if (optDef.required) {
          throw new BadRequestException(
            `userSelections.${key} is required but was not provided`,
          );
        }
        if (optDef.default !== undefined) {
          result[key] = optDef.default;
        }
        continue;
      }

      if (optDef.type === 'select') {
        const allowed: string[] = (optDef.options ?? []).map(
          (o: any) => o.value,
        );
        if (!allowed.includes(String(rawValue))) {
          throw new BadRequestException(
            `userSelections.${key} value "${rawValue}" is not in the allowed options: [${allowed.join(', ')}]`,
          );
        }
        result[key] = String(rawValue);
      } else if (optDef.type === 'slider') {
        const num = Number(rawValue);
        if (isNaN(num)) {
          throw new BadRequestException(
            `userSelections.${key} must be a number`,
          );
        }
        if (num < optDef.min || num > optDef.max) {
          throw new BadRequestException(
            `userSelections.${key} value ${num} is outside allowed range [${optDef.min}, ${optDef.max}]`,
          );
        }
        result[key] = num;
      } else if (optDef.type === 'color') {
        const hex = String(rawValue);
        if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
          throw new BadRequestException(
            `userSelections.${key} must be a valid hex color (e.g. #448da6)`,
          );
        }
        result[key] = hex;
      }
    }

    return result;
  }

  async markFailed(generationId: string, errorMessage: string) {
    const updated = await this.prisma.generation.update({
      where: { id: generationId },
      data: {
        status: 'failed',
        errorMessage,
      },
    });

    await this.syncLinkedOrderItems(generationId, 'failed');

    return updated;
  }
}
