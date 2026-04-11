import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all active products' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  findAll() {
    return this.productsService.findAll();
  }

  @Public()
  @Get(':handle/variants')
  @ApiOperation({
    summary: 'Get product variants with pre-resolved formatId mapping',
    description:
      'Looks up a product by its Shopify handle and returns the active variants with their backend formatId. The shopifyVariantId is normalized to the GID format used by the Shopify Storefront API so the frontend can match directly.',
  })
  @ApiResponse({ status: 200, description: 'Variants retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findByHandleWithVariants(@Param('handle') handle: string) {
    return this.productsService.findByHandleWithVariants(handle);
  }

  @Public()
  @Get(':productId')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('productId') productId: string) {
    return this.productsService.findOne(productId);
  }
}
