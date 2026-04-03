import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductReferencesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.productReference.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findActive() {
    return this.prisma.productReference.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const productRef = await this.prisma.productReference.findUnique({
      where: { id },
    });
    if (!productRef) {
      throw new NotFoundException(`ProductReference ${id} not found`);
    }
    return productRef;
  }
}
