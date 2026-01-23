import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PetsService } from './pets.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('pets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new pet' })
  @ApiResponse({ status: 201, description: 'Pet created successfully' })
  create(@CurrentUser() user: any, @Body() createPetDto: CreatePetDto) {
    return this.petsService.create(user.sub, createPetDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all user pets' })
  @ApiResponse({ status: 200, description: 'Pets retrieved successfully' })
  findAll(@CurrentUser() user: any) {
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
    @CurrentUser() user: any,
    @Body() updatePetDto: UpdatePetDto,
  ) {
    return this.petsService.update(id, user.sub, updatePetDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete (soft) pet' })
  @ApiResponse({ status: 200, description: 'Pet deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Pet not found' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.petsService.remove(id, user.sub);
  }
}
