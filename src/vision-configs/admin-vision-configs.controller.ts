import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { VisionConfigsService } from './vision-configs.service';
import { CreateVisionConfigDto } from './dto/create-vision-config.dto';
import { UpdateVisionConfigDto } from './dto/update-vision-config.dto';

@ApiTags('Admin - Vision Configs')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/vision-configs')
export class AdminVisionConfigsController {
  constructor(private readonly service: VisionConfigsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/styles')
  findUsages(@Param('id') id: string) {
    return this.service.findUsages(id);
  }

  @Post()
  create(@Body() dto: CreateVisionConfigDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVisionConfigDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  remove(@Param('id') id: string, @Query('force') force?: string) {
    return this.service.remove(id, force === 'true');
  }
}
