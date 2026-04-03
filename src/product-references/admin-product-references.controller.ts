import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ProductReferencesService } from './product-references.service';
import { CreateProductReferenceDto } from './dto/create-product-reference.dto';
import { UpdateProductReferenceDto } from './dto/update-product-reference.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('admin-products')
@ApiBearerAuth()
@Controller('admin/products')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminProductReferencesController {
  constructor(
    private readonly productReferencesService: ProductReferencesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new product reference' })
  @ApiResponse({ status: 201, description: 'Product reference created successfully' })
  @ApiResponse({ status: 409, description: 'Shopify product ID already exists' })
  create(@Body() dto: CreateProductReferenceDto) {
    return this.productReferencesService.create(dto);
  }

  @Patch(':productId')
  @ApiOperation({ summary: 'Update a product reference' })
  @ApiResponse({ status: 200, description: 'Product reference updated successfully' })
  @ApiResponse({ status: 404, description: 'Product reference not found' })
  @ApiResponse({ status: 409, description: 'Shopify product ID already exists' })
  update(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductReferenceDto,
  ) {
    return this.productReferencesService.update(productId, dto);
  }

  @Delete(':productId')
  @ApiOperation({ summary: 'Soft delete a product reference (sets isActive = false)' })
  @ApiResponse({ status: 200, description: 'Product reference deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Product reference not found' })
  softDelete(@Param('productId') productId: string) {
    return this.productReferencesService.softDelete(productId);
  }
}
