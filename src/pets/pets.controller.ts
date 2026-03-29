import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { PetsService } from './pets.service';
import { StorageService } from '../storage/storage.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { v4 as uuidv4 } from 'uuid';

interface AuthUser {
  sub: string;
  email: string;
  role: string;
}

@ApiTags('pets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pets')
export class PetsController {
  constructor(
    private readonly petsService: PetsService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new pet' })
  @ApiResponse({ status: 201, description: 'Pet created successfully' })
  create(@CurrentUser() user: AuthUser, @Body() createPetDto: CreatePetDto) {
    return this.petsService.create(user.sub, createPetDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all user pets' })
  @ApiResponse({ status: 200, description: 'Pets retrieved successfully' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.petsService.findAll(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pet by ID' })
  @ApiResponse({ status: 200, description: 'Pet retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  findOne(@Param('id') id: string) {
    return this.petsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update pet' })
  @ApiResponse({ status: 200, description: 'Pet updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() updatePetDto: UpdatePetDto,
  ) {
    return this.petsService.update(id, user.sub, updatePetDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete (soft) pet' })
  @ApiResponse({ status: 200, description: 'Pet deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.petsService.remove(id, user.sub);
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Upload a photo for a pet' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Photo uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  @UseInterceptors(FileInterceptor('photo'))
  async addPhoto(
    @Param('id') petId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Query('isPrimary') isPrimary?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    const key = `pets/${user.sub}/${petId}/${uuidv4()}`;
    const photoUrl = await this.storageService.upload(
      key,
      file.buffer,
      file.mimetype,
    );

    return this.petsService.addPhoto(
      petId,
      user.sub,
      photoUrl,
      key,
      isPrimary === 'true',
    );
  }

  @Delete(':id/photos/:photoId')
  @ApiOperation({ summary: 'Delete a pet photo' })
  @ApiResponse({ status: 200, description: 'Photo deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Photo not found' })
  async deletePhoto(
    @Param('id') petId: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const storageKey = await this.petsService.deletePhoto(
      petId,
      photoId,
      user.sub,
    );
    await this.storageService.delete(storageKey);
    return { message: 'Photo deleted successfully' };
  }
}
