import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFormatDto } from './dto/create-format.dto';
import { UpdateFormatDto } from './dto/update-format.dto';

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

  async create(dto: CreateFormatDto) {
    return this.prisma.format.create({ data: dto });
  }

  async update(id: string, dto: UpdateFormatDto) {
    await this.findOne(id);
    return this.prisma.format.update({ where: { id }, data: dto });
  }

  async softDelete(id: string) {
    await this.findOne(id);
    return this.prisma.format.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
