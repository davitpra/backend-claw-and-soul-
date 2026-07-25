import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';
import { PUBLIC_GENERATION_SELECT } from '../generations/generation-select';

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

    const where: Prisma.GenerationWhereInput = {
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
        select: PUBLIC_GENERATION_SELECT,
      }),
      this.prisma.generation.count({ where }),
    ]);

    return createPaginatedResult(generations, total, page, limit);
  }

  async findOnePublic(id: string) {
    // Los filtros van en el `where`: la proyección pública ya no expone
    // `isPublic`, así que no se pueden comprobar sobre la fila devuelta.
    const generation = await this.prisma.generation.findFirst({
      where: { id, isPublic: true, status: 'completed' },
      select: PUBLIC_GENERATION_SELECT,
    });

    if (!generation) {
      throw new NotFoundException('Generation not found');
    }

    return generation;
  }
}
