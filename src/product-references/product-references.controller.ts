import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ProductReferencesService } from './product-references.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('products')
@Controller('products')
export class ProductReferencesController {
  constructor(
    private readonly productReferencesService: ProductReferencesService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all active product references' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  findAll() {
    return this.productReferencesService.findAll();
  }

  @Public()
  @Get(':productId')
  @ApiOperation({ summary: 'Get product reference by ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product reference not found' })
  findOne(@Param('productId') productId: string) {
    return this.productReferencesService.findOne(productId);
  }
}
