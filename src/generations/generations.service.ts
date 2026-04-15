import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { StylesService } from '../styles/styles.service';
import { CreateImageGenerationDto } from './dto/create-image-generation.dto';
import { UpdateGenerationFlagsDto } from './dto/update-generation-flags.dto';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';
import { QUEUE_NAMES, JOB_NAMES } from './constants/queues.constants';

@Injectable()
export class GenerationsService {
  private readonly logger = new Logger(GenerationsService.name);

  constructor(
    private prisma: PrismaService,
    private petsService: PetsService,
    private stylesService: StylesService,
    @InjectQueue(QUEUE_NAMES.IMAGE_GENERATION) private imageQueue: Queue,
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

    // Validate style exists
    await this.stylesService.findOne(createDto.styleId);

    // Create generation record (no credit checks - all generations are free)
    const generation = await this.prisma.generation.create({
      data: {
        userId,
        petId: createDto.petId,
        petPhotoId: createDto.petPhotoId,
        styleId: createDto.styleId,
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
        },
      },
      include: {
        pet: true,
        style: true,
      },
    });

    this.logger.log(`Image generation created: ${generation.id}`);

    await this.imageQueue.add(JOB_NAMES.GENERATE, { generationId: generation.id });

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

    const where: any = { userId, type: 'image' };
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
    data?: any,
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
      select: { status: true, userId: true, metadata: true },
    });

    if (!generation) {
      throw new NotFoundException('Generation not found');
    }

    if (generation.userId !== userId) {
      throw new BadRequestException('Access denied');
    }

    return {
      status: generation.status,
      progress: (generation.metadata as any)?.progress ?? null,
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
        ...(updateDto.isPublic !== undefined && { isPublic: updateDto.isPublic }),
        ...(updateDto.isFavorite !== undefined && { isFavorite: updateDto.isFavorite }),
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
        style: true,
        pet: true,
        petPhoto: true,
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
    },
  ) {
    return this.prisma.generation.update({
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
      },
    });
  }

  async markFailed(generationId: string, errorMessage: string) {
    return this.prisma.generation.update({
      where: { id: generationId },
      data: {
        status: 'failed',
        errorMessage,
      },
    });
  }
}
