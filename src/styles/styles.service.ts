import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
    file: Express.Multer.File,
    petContext: { petName: string; petSpecies: string; petBreed: string },
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

    const inputKey = `styles/${styleId}/test-inputs/${uuidv4()}`;
    const inputPhotoUrl = await this.storageService.upload(
      inputKey,
      file.buffer,
      file.mimetype,
    );

    const generation = await this.prisma.generation.create({
      data: {
        userId: adminUserId,
        petId: null,
        petPhotoId: null,
        styleId,
        type: 'image',
        status: 'pending',
        prompt: style.promptTemplate,
        provider: 'fal',
        isAdminTest: true,
        metadata: {
          petContext,
          inputPhotoUrl,
          inputStorageKey: inputKey,
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
}
