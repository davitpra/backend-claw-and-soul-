import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateImageGenConfigDto } from './dto/create-image-gen-config.dto';
import { UpdateImageGenConfigDto } from './dto/update-image-gen-config.dto';

@Injectable()
export class ImageGenConfigsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.imageGenConfig.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const config = await this.prisma.imageGenConfig.findUnique({
      where: { id },
    });
    if (!config) throw new NotFoundException('ImageGenConfig not found');
    return config;
  }

  async findUsages(id: string) {
    await this.findOne(id);
    return this.prisma.style.findMany({
      where: { imageGenConfigId: id },
      select: { id: true, name: true, displayName: true, isActive: true },
    });
  }

  async create(dto: CreateImageGenConfigDto) {
    try {
      return await this.prisma.imageGenConfig.create({ data: dto });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(
          `An ImageGenConfig with name "${dto.name}" already exists`,
        );
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateImageGenConfigDto) {
    await this.findOne(id);
    try {
      return await this.prisma.imageGenConfig.update({
        where: { id },
        data: dto,
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(
          `An ImageGenConfig with that name already exists`,
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
        `ImageGenConfig is used by ${usages.length} style(s). Use ?force=true to unlink and delete.`,
      );
    }

    return this.prisma.imageGenConfig.delete({ where: { id } });
  }
}
