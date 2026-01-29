import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { StylesService } from '../styles/styles.service';
import { CreateImageGenerationDto } from './dto/create-image-generation.dto';
import { CreateVideoGenerationDto } from './dto/create-video-generation.dto';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';

@Injectable()
export class GenerationsService {
  private readonly logger = new Logger(GenerationsService.name);

  constructor(
    private prisma: PrismaService,
    private petsService: PetsService,
    private stylesService: StylesService,
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

    // TODO: Enqueue job in Bull Queue
    // await this.imageQueue.add('generate', { generationId: generation.id });

    return generation;
  }

  async createVideoGeneration(
    userId: string,
    createDto: CreateVideoGenerationDto,
  ) {
    // Validate source generation
    const sourceGeneration = await this.prisma.generation.findUnique({
      where: { id: createDto.sourceGenerationId },
      include: { pet: true, style: true },
    });

    if (!sourceGeneration) {
      throw new NotFoundException('Source generation not found');
    }

    if (sourceGeneration.userId !== userId) {
      throw new BadRequestException(
        'Source generation does not belong to user',
      );
    }

    if (sourceGeneration.type !== 'image') {
      throw new BadRequestException('Source must be an image generation');
    }

    if (sourceGeneration.status !== 'completed') {
      throw new BadRequestException('Source generation must be completed');
    }

    // Create generation record (no credit checks - all generations are free)
    const duration = createDto.duration || 3;

    const generation = await this.prisma.generation.create({
      data: {
        userId,
        petId: sourceGeneration.petId,
        petPhotoId: sourceGeneration.petPhotoId,
        styleId: sourceGeneration.styleId,
        type: 'video',
        status: 'pending',
        prompt: sourceGeneration.prompt,
        provider: createDto.provider || 'runway',
        metadata: {
          sourceGenerationId: createDto.sourceGenerationId,
          sourceImageUrl: sourceGeneration.resultUrl,
          duration,
          motion: createDto.motion || 'medium',
        },
      },
      include: {
        pet: true,
        style: true,
      },
    });

    this.logger.log(`Video generation created: ${generation.id}`);

    // TODO: Enqueue job in Bull Queue
    // await this.videoQueue.add('generate', { generationId: generation.id });

    return generation;
  }

  async findUserGenerations(
    userId: string,
    page: number = 1,
    limit: number = 20,
    type?: string,
  ) {
    const { skip, take } = getPaginationParams(page, limit);

    const where: any = { userId };
    if (type) {
      where.type = type;
    }

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

  async deleteGeneration(id: string, userId: string) {
    const generation = await this.findOne(id, userId);

    if (generation.userId !== userId) {
      throw new BadRequestException('Access denied');
    }

    return this.prisma.generation.delete({
      where: { id },
    });
  }
}
