import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FormatsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.format.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findActive() {
    return this.prisma.format.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const format = await this.prisma.format.findUnique({ where: { id } });
    if (!format) {
      throw new NotFoundException(`Format ${id} not found`);
    }
    return format;
  }
}
