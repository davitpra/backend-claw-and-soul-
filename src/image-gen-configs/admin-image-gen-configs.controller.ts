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
import { ImageGenConfigsService } from './image-gen-configs.service';
import { CreateImageGenConfigDto } from './dto/create-image-gen-config.dto';
import { UpdateImageGenConfigDto } from './dto/update-image-gen-config.dto';

@ApiTags('Admin - Image Gen Configs')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/image-gen-configs')
export class AdminImageGenConfigsController {
  constructor(private readonly service: ImageGenConfigsService) {}

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
  create(@Body() dto: CreateImageGenConfigDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateImageGenConfigDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  remove(@Param('id') id: string, @Query('force') force?: string) {
    return this.service.remove(id, force === 'true');
  }
}
