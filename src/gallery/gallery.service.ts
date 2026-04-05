import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';

@Injectable()
export class GalleryService {
  constructor(private prisma: PrismaService) {}

  async findPublicGenerations(
    page: number = 1,
    limit: number = 20,
    styleId?: string,
    species?: string,
  ) {
    const { skip, take } = getPaginationParams(page, limit);

    const where: any = {
      isPublic: true,
      status: 'completed',
    };

    if (styleId) where.styleId = styleId;
    if (species) where.pet = { species };

    const [generations, total] = await Promise.all([
      this.prisma.generation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          pet: { select: { name: true, species: true, breed: true } },
          style: { select: { id: true, name: true, category: true } },
        },
      }),
      this.prisma.generation.count({ where }),
    ]);

    return createPaginatedResult(generations, total, page, limit);
  }

  async findOnePublic(id: string) {
    const generation = await this.prisma.generation.findUnique({
      where: { id },
      include: {
        pet: { select: { name: true, species: true, breed: true } },
        style: { select: { id: true, name: true, category: true } },
      },
    });

    if (!generation || !generation.isPublic || generation.status !== 'completed') {
      throw new NotFoundException('Generation not found');
    }

    return generation;
  }
}
