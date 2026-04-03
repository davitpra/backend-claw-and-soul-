import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { StylesService } from './styles.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('styles')
@Controller('styles')
export class StylesController {
  constructor(private readonly stylesService: StylesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all active styles' })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'is_premium', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Styles retrieved successfully' })
  findAll(
    @Query('category') category?: string,
    @Query('is_premium') isPremium?: string,
  ) {
    return this.stylesService.findAll(
      category,
      isPremium === 'true' ? true : isPremium === 'false' ? false : undefined,
    );
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Get all style categories' })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
  })
  getCategories() {
    return this.stylesService.getCategories();
  }

  @Public()
  @Get('category/:category')
  @ApiOperation({ summary: 'Get styles by category' })
  @ApiResponse({ status: 200, description: 'Styles retrieved successfully' })
  findByCategory(@Param('category') category: string) {
    return this.stylesService.findByCategory(category);
  }

  @Public()
  @Get(':id/images')
  @ApiOperation({ summary: 'Get images for a style' })
  @ApiQuery({ name: 'is_primary', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Images retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Style not found' })
  getStyleImages(
    @Param('id') id: string,
    @Query('is_primary') isPrimary?: string,
  ) {
    return this.stylesService.getStyleImages(
      id,
      isPrimary === 'true' ? true : isPrimary === 'false' ? false : undefined,
    );
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get style by ID' })
  @ApiResponse({ status: 200, description: 'Style retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Style not found' })
  findOne(@Param('id') id: string) {
    return this.stylesService.findOne(id);
  }
}
