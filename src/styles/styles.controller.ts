import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StylesService } from './styles.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('styles')
@Controller('styles')
export class StylesController {
  constructor(private readonly stylesService: StylesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all active styles' })
  @ApiResponse({ status: 200, description: 'Styles retrieved successfully' })
  findAll() {
    return this.stylesService.findAll();
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
  @Get(':id')
  @ApiOperation({ summary: 'Get style by ID' })
  @ApiResponse({ status: 200, description: 'Style retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Style not found' })
  findOne(@Param('id') id: string) {
    return this.stylesService.findOne(id);
  }
}
