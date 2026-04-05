import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { GalleryService } from './gallery.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('gallery')
@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get public generations gallery' })
  @ApiQuery({ name: 'style_id', required: false, type: String })
  @ApiQuery({ name: 'species', required: false, enum: ['dog', 'cat', 'bird', 'rabbit', 'other'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Gallery retrieved successfully' })
  findAll(
    @Query('style_id') styleId?: string,
    @Query('species') species?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.galleryService.findPublicGenerations(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      styleId,
      species,
    );
  }

  @Public()
  @Get(':genId')
  @ApiOperation({ summary: 'Get public generation detail' })
  @ApiResponse({ status: 200, description: 'Generation retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Generation not found' })
  findOne(@Param('genId') genId: string) {
    return this.galleryService.findOnePublic(genId);
  }
}
