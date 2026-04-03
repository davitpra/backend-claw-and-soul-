import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

@Injectable()
export class PetsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createPetDto: CreatePetDto) {
    return this.prisma.pet.create({
      data: {
        ...createPetDto,
        userId,
      },
      include: {
        photos: true,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.pet.findMany({
      where: { userId, isActive: true },
      include: {
        photos: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const pet = await this.prisma.pet.findUnique({
      where: { id },
      include: {
        photos: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!pet) {
      throw new NotFoundException('Pet not found');
    }

    return pet;
  }

  async update(id: string, userId: string, updatePetDto: UpdatePetDto) {
    // Check ownership
    const pet = await this.findOne(id);
    if (pet.userId !== userId) {
      throw new ForbiddenException('You do not own this pet');
    }

    return this.prisma.pet.update({
      where: { id },
      data: updatePetDto,
      include: {
        photos: true,
      },
    });
  }

  async remove(id: string, userId: string) {
    // Check ownership
    const pet = await this.findOne(id);
    if (pet.userId !== userId) {
      throw new ForbiddenException('You do not own this pet');
    }

    // Soft delete
    return this.prisma.pet.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async deletePhoto(
    petId: string,
    photoId: string,
    userId: string,
  ): Promise<string> {
    const pet = await this.findOne(petId);
    if (pet.userId !== userId) {
      throw new ForbiddenException('You do not own this pet');
    }

    const photo = await this.prisma.petPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo || photo.petId !== petId) {
      throw new NotFoundException('Photo not found');
    }

    await this.prisma.petPhoto.delete({ where: { id: photoId } });

    return photo.photoStorageKey;
  }

  async getPhotos(petId: string, userId: string) {
    const pet = await this.findOne(petId);
    if (pet.userId !== userId) {
      throw new ForbiddenException('You do not own this pet');
    }

    return this.prisma.petPhoto.findMany({
      where: { petId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async updatePhoto(
    petId: string,
    photoId: string,
    userId: string,
    data: { orderIndex?: number; isPrimary?: boolean },
  ) {
    const pet = await this.findOne(petId);
    if (pet.userId !== userId) {
      throw new ForbiddenException('You do not own this pet');
    }

    const photo = await this.prisma.petPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo || photo.petId !== petId) {
      throw new NotFoundException('Photo not found');
    }

    if (data.isPrimary) {
      await this.prisma.petPhoto.updateMany({
        where: { petId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.petPhoto.update({
      where: { id: photoId },
      data: {
        ...(data.orderIndex !== undefined && { orderIndex: data.orderIndex }),
        ...(data.isPrimary !== undefined && { isPrimary: data.isPrimary }),
      },
    });
  }

  async addPhoto(
    petId: string,
    userId: string,
    photoUrl: string,
    photoStorageKey: string,
    isPrimary: boolean = false,
  ) {
    // Check ownership
    const pet = await this.findOne(petId);
    if (pet.userId !== userId) {
      throw new ForbiddenException('You do not own this pet');
    }

    // Get current max order index
    const maxPhoto = await this.prisma.petPhoto.findFirst({
      where: { petId },
      orderBy: { orderIndex: 'desc' },
    });

    const orderIndex = maxPhoto ? maxPhoto.orderIndex + 1 : 0;

    // If setting as primary, unset all other photos
    if (isPrimary) {
      await this.prisma.petPhoto.updateMany({
        where: { petId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.petPhoto.create({
      data: {
        petId,
        photoUrl,
        photoStorageKey,
        isPrimary,
        orderIndex,
      },
    });
  }
}
