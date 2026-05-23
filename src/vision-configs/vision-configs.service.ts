import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVisionConfigDto } from './dto/create-vision-config.dto';
import { UpdateVisionConfigDto } from './dto/update-vision-config.dto';

@Injectable()
export class VisionConfigsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.visionConfig.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const config = await this.prisma.visionConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException('VisionConfig not found');
    return config;
  }

  async findUsages(id: string) {
    await this.findOne(id);
    return this.prisma.style.findMany({
      where: { visionConfigId: id },
      select: { id: true, name: true, displayName: true, isActive: true },
    });
  }

  async create(dto: CreateVisionConfigDto) {
    try {
      return await this.prisma.visionConfig.create({
        data: dto,
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(
          `A VisionConfig with name "${dto.name}" already exists`,
        );
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateVisionConfigDto) {
    await this.findOne(id);
    try {
      return await this.prisma.visionConfig.update({
        where: { id },
        data: dto,
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(
          `A VisionConfig with that name already exists`,
        );
      }
      throw e;
    }
  }

  async remove(id: string, force = false) {
    await this.findOne(id);
    const usages = await this.findUsages(id);

    if (usages.length > 0 && !force) {
      throw new ConflictException(
        `VisionConfig is used by ${usages.length} style(s). Use ?force=true to unlink and delete.`,
      );
    }

    return this.prisma.visionConfig.delete({ where: { id } });
  }
}
