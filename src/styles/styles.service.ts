import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DEFAULT_PROMPT_TEMPLATE } from '../vision-configs/vision-configs.constants';
import { v4 as uuidv4 } from 'uuid';
import { CreateStyleDto } from './dto/create-style.dto';
import { UpdateStyleDto } from './dto/update-style.dto';
import { UpdateStyleImageDto } from './dto/update-style-image.dto';
import { derivePreviewUrl } from './style-preview.util';

@Injectable()
export class StylesService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    @InjectQueue('image-generation') private imageQueue: Queue,
  ) {}

  async findAll(category?: string) {
    const where: Prisma.StyleWhereInput = { isActive: true };
    if (category) where.category = category;

    const styles = await this.prisma.style.findMany({
      where,
      orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
      include: {
        images: { orderBy: { orderIndex: 'asc' } },
      },
    });

    return styles.map((s) => ({
      ...s,
      previewUrl: derivePreviewUrl(s.images),
    }));
  }

  async findOne(id: string) {
    const style = await this.prisma.style.findUnique({
      where: { id },
      include: {
        images: { orderBy: { orderIndex: 'asc' } },
      },
    });

    if (!style) {
      throw new NotFoundException('Style not found');
    }

    return { ...style, previewUrl: derivePreviewUrl(style.images) };
  }

  async findOneForAdmin(id: string) {
    const style = await this.prisma.style.findUnique({
      where: { id },
      include: {
        images: { orderBy: { orderIndex: 'asc' } },
        visionConfig: true,
        imageGenConfig: true,
        _count: { select: { generations: true, productReferences: true } },
      },
    });

    if (!style) {
      throw new NotFoundException('Style not found');
    }

    return { ...style, previewUrl: derivePreviewUrl(style.images) };
  }

  async findByCategory(category: string) {
    const styles = await this.prisma.style.findMany({
      where: { category, isActive: true },
      orderBy: { displayName: 'asc' },
      include: { images: { orderBy: { orderIndex: 'asc' } } },
    });

    return styles.map((s) => ({
      ...s,
      previewUrl: derivePreviewUrl(s.images),
    }));
  }

  async getStyleImages(styleId: string, isPrimary?: boolean) {
    const style = await this.prisma.style.findUnique({
      where: { id: styleId },
    });
    if (!style) throw new NotFoundException('Style not found');

    const where: Prisma.StyleImageWhereInput = { styleId };
    if (isPrimary !== undefined) where.isPrimary = isPrimary;

    return this.prisma.styleImage.findMany({
      where,
      orderBy: { orderIndex: 'asc' },
    });
  }

  async findAllForAdmin() {
    const styles = await this.prisma.style.findMany({
      orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
      include: {
        images: { orderBy: { orderIndex: 'asc' } },
        visionConfig: true,
        imageGenConfig: true,
      },
    });
    return styles.map((s) => ({
      ...s,
      previewUrl: derivePreviewUrl(s.images),
    }));
  }

  async create(dto: CreateStyleDto) {
    try {
      return await this.prisma.style.create({
        data: {
          ...dto,
          promptTemplate: dto.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2003') {
        throw new BadRequestException(
          'Invalid visionConfigId or imageGenConfigId — referenced config does not exist',
        );
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateStyleDto) {
    await this.findOne(id);
    try {
      await this.prisma.style.update({ where: { id }, data: dto });
    } catch (e: any) {
      if (e?.code === 'P2003') {
        throw new BadRequestException(
          'Invalid visionConfigId or imageGenConfigId — referenced config does not exist',
        );
      }
      throw e;
    }
    return this.findOneForAdmin(id);
  }

  async softDelete(id: string) {
    await this.findOne(id);
    return this.prisma.style.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async hardDelete(id: string) {
    const style = await this.prisma.style.findUnique({
      where: { id },
      include: {
        images: true,
        _count: { select: { generations: true } },
      },
    });
    if (!style) throw new NotFoundException('Style not found');

    if (style._count.generations > 0) {
      throw new BadRequestException(
        `No se puede eliminar permanentemente: el estilo tiene ${style._count.generations} generación(es) asociada(s). Desactívalo en su lugar.`,
      );
    }

    for (const img of style.images) {
      await this.storageService.delete(img.storageKey).catch(() => null);
    }

    return this.prisma.style.delete({ where: { id } });
  }

  async addImage(
    styleId: string,
    file: Express.Multer.File,
    altImage?: string,
    orderIndex?: number,
  ) {
    await this.findOne(styleId);

    const key = `styles/${styleId}/${uuidv4()}`;
    const imageUrl = await this.storageService.upload(
      key,
      file.buffer,
      file.mimetype,
    );

    return this.prisma.styleImage.create({
      data: {
        styleId,
        imageUrl,
        storageKey: key,
        altImage,
        orderIndex: orderIndex ?? 0,
      },
    });
  }

  async updateImage(styleId: string, imgId: string, dto: UpdateStyleImageDto) {
    const image = await this.prisma.styleImage.findFirst({
      where: { id: imgId, styleId },
    });

    if (!image) {
      throw new NotFoundException('Style image not found');
    }

    if (dto.isPrimary === true) {
      await this.prisma.styleImage.updateMany({
        where: { styleId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.styleImage.update({
      where: { id: imgId },
      data: {
        ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
        ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
        ...(dto.altImage !== undefined && { altImage: dto.altImage }),
      },
    });
  }

  async removeImage(styleId: string, imgId: string) {
    const image = await this.prisma.styleImage.findFirst({
      where: { id: imgId, styleId },
    });

    if (!image) {
      throw new NotFoundException('Style image not found');
    }

    await this.storageService.delete(image.storageKey);
    return this.prisma.styleImage.delete({ where: { id: imgId } });
  }

  async getCategories() {
    const styles = await this.prisma.style.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
    });

    return styles.map((s) => s.category);
  }

  async runAdminTestGeneration(
    styleId: string,
    adminUserId: string,
    input: { file?: Express.Multer.File; petPhotoId?: string },
    petContextOverride: {
      petName?: string;
      petSpecies?: string;
      petBreed?: string;
    },
    aspectRatio?: string,
    userSelections?: Record<string, string | number>,
  ) {
    const style = await this.prisma.style.findUnique({
      where: { id: styleId },
      include: { visionConfig: true, imageGenConfig: true },
    });
    if (!style) throw new NotFoundException('Style not found');
    if (!style.visionConfigId) {
      throw new BadRequestException(
        'El estilo no tiene visionConfig configurado',
      );
    }
    if (!style.imageGenConfigId) {
      throw new BadRequestException(
        'El estilo no tiene imageGenConfig configurado',
      );
    }

    let inputPhotoUrl: string;
    let inputStorageKey: string;
    let resolvedPetId: string | null = null;
    let resolvedPetPhotoId: string | null = null;
    let petContext: { petName: string; petSpecies: string; petBreed: string };

    if (input.petPhotoId) {
      const petPhoto = await this.prisma.petPhoto.findUnique({
        where: { id: input.petPhotoId },
        include: { pet: true },
      });
      if (!petPhoto) throw new NotFoundException('PetPhoto not found');
      if (petPhoto.pet.userId !== adminUserId) {
        throw new ForbiddenException('You do not own this pet photo');
      }

      inputPhotoUrl = petPhoto.photoUrl;
      inputStorageKey = petPhoto.photoStorageKey;
      resolvedPetId = petPhoto.petId;
      resolvedPetPhotoId = petPhoto.id;
      petContext = {
        petName: petContextOverride.petName ?? petPhoto.pet.name,
        petSpecies: petContextOverride.petSpecies ?? petPhoto.pet.species,
        petBreed: petContextOverride.petBreed ?? petPhoto.pet.breed ?? '',
      };
    } else if (input.file) {
      const inputKey = `styles/${styleId}/test-inputs/${uuidv4()}`;
      inputPhotoUrl = await this.storageService.upload(
        inputKey,
        input.file.buffer,
        input.file.mimetype,
      );
      inputStorageKey = inputKey;
      petContext = {
        petName: petContextOverride.petName ?? 'Test Pet',
        petSpecies: petContextOverride.petSpecies ?? 'dog',
        petBreed: petContextOverride.petBreed ?? '',
      };
    } else {
      throw new BadRequestException('Provide either a file or a petPhotoId');
    }

    const generation = await this.prisma.generation.create({
      data: {
        userId: adminUserId,
        petId: resolvedPetId,
        petPhotoId: resolvedPetPhotoId,
        styleId,
        type: 'image',
        status: 'pending',
        prompt: style.promptTemplate,
        provider: 'fal',
        isAdminTest: true,
        metadata: {
          petContext,
          inputPhotoUrl,
          inputStorageKey,
          ...(aspectRatio ? { compatConstraints: { aspectRatio } } : {}),
          ...(userSelections && Object.keys(userSelections).length > 0
            ? { userSelections }
            : {}),
        },
      },
    });

    await this.imageQueue.add('generate', { generationId: generation.id });

    return { generationId: generation.id, status: generation.status };
  }

  async getImageGeneration(styleId: string, imageId: string) {
    const image = await this.prisma.styleImage.findUnique({
      where: { id: imageId },
    });
    if (!image || image.styleId !== styleId) {
      throw new NotFoundException('Style image not found');
    }

    const generation = await this.prisma.generation.findFirst({
      where: {
        styleId,
        isAdminTest: true,
        resultStorageKey: image.storageKey,
      },
      select: {
        id: true,
        prompt: true,
        finalPrompt: true,
        metadata: true,
        visionAnalysis: true,
        provider: true,
        falRequestId: true,
        processingTimeSeconds: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return { generation };
  }
}
