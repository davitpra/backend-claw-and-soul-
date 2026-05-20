import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
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
  ) {}

  async findAll(category?: string) {
    const where: Prisma.StyleWhereInput = { isActive: true };
    if (category) where.category = category;

    const styles = await this.prisma.style.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
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

  async findByCategory(category: string) {
    const styles = await this.prisma.style.findMany({
      where: { category, isActive: true },
      orderBy: { sortOrder: 'asc' },
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
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      include: { images: { orderBy: { orderIndex: 'asc' } } },
    });
    return styles.map((s) => ({
      ...s,
      previewUrl: derivePreviewUrl(s.images),
    }));
  }

  async create(dto: CreateStyleDto) {
    return this.prisma.style.create({ data: dto });
  }

  async update(id: string, dto: UpdateStyleDto) {
    await this.findOne(id);
    return this.prisma.style.update({ where: { id }, data: dto });
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
    caption?: string,
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
        caption,
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
}
