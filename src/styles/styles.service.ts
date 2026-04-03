import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StylesService {
  constructor(private prisma: PrismaService) {}

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

  async getCategories() {
    const styles = await this.prisma.style.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
    });

    return styles.map((s) => s.category);
  }
}
