import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { v4 as uuidv4 } from 'uuid';
import { CreateStyleDto } from './dto/create-style.dto';
import { UpdateStyleDto } from './dto/update-style.dto';

@Injectable()
export class StylesService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  async findAll(category?: string, isPremium?: boolean) {
    const where: any = { isActive: true };
    if (category) where.category = category;
    if (isPremium !== undefined) where.isPremium = isPremium;

    return this.prisma.style.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      include: {
        images: { orderBy: { orderIndex: 'asc' } },
      },
    });
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

    return style;
  }

  async findByCategory(category: string) {
    return this.prisma.style.findMany({
      where: { category, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getStyleImages(styleId: string, isPrimary?: boolean) {
    const style = await this.prisma.style.findUnique({ where: { id: styleId } });
    if (!style) throw new NotFoundException('Style not found');

    const where: any = { styleId };
    if (isPrimary !== undefined) where.isPrimary = isPrimary;

    return this.prisma.styleImage.findMany({
      where,
      orderBy: { orderIndex: 'asc' },
    });
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
