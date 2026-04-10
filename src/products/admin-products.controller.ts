import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ShopifyApiService } from '../shopify-sync/shopify-api.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('admin-products')
@ApiBearerAuth()
@Controller('admin/products')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly shopifyApiService: ShopifyApiService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':productId/variants')
  @ApiOperation({ summary: 'Get linked and unlinked Shopify variants for a product' })
  @ApiResponse({ status: 200, description: 'Variant link status retrieved' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getVariantLinks(@Param('productId') productId: string) {
    const product = await this.productsService.findOne(productId);

    // Get all linked variants from DB
    const dbVariants = await this.prisma.productFormatVariant.findMany({
      where: { productRefId: productId },
      include: { format: { select: { id: true, displayName: true, shopifyVariantOption: true } } },
    });

    const linkedVariantsMap = new Map(
      dbVariants.filter((v) => v.isActive).map((v) => [v.shopifyVariantId, v]),
    );

    // Fetch live variants from Shopify
    const shopifyProduct = await this.shopifyApiService.fetchProductById(
      product.shopifyProductId,
    );

    if (!shopifyProduct) {
      // Shopify unreachable — return only what we have in DB
      return {
        product: { id: product.id, displayName: product.displayName },
        linkedVariants: dbVariants
          .filter((v) => v.isActive)
          .map((v) => ({
            format: { id: v.format.id, displayName: v.format.displayName },
            shopifyVariantId: v.shopifyVariantId,
            shopifyVariantTitle: v.shopifyVariantTitle,
            isActive: v.isActive,
          })),
        unlinkedVariants: [],
      };
    }

    // Get all formats indexed by shopifyVariantOption for fast lookup
    const formats = await this.prisma.format.findMany({
      where: { isActive: true, shopifyVariantOption: { not: null } },
      select: { id: true, displayName: true, shopifyVariantOption: true },
    });
    const formatByOption = new Map(
      formats.map((f) => [f.shopifyVariantOption, f]),
    );

    const linkedVariants: object[] = [];
    const unlinkedVariants: object[] = [];

    for (const variant of shopifyProduct.variants) {
      const shopifyVariantId = String(variant.id);
      const sizeValue = variant.option1?.trim();

      if (linkedVariantsMap.has(shopifyVariantId)) {
        const dbVariant = linkedVariantsMap.get(shopifyVariantId)!;
        linkedVariants.push({
          format: { id: dbVariant.format.id, displayName: dbVariant.format.displayName },
          shopifyVariantId,
          shopifyVariantTitle: variant.title,
          isActive: dbVariant.isActive,
        });
        continue;
      }

      // Not linked — determine why
      if (!sizeValue) {
        unlinkedVariants.push({
          shopifyVariantId,
          shopifyVariantTitle: variant.title,
          reason: 'La variante no tiene opción de tamaño (option1 vacío)',
        });
        continue;
      }

      const matchedFormat = formatByOption.get(sizeValue);
      if (!matchedFormat) {
        unlinkedVariants.push({
          shopifyVariantId,
          shopifyVariantTitle: variant.title,
          reason: `No hay formato configurado para '${sizeValue}'`,
        });
      } else {
        unlinkedVariants.push({
          shopifyVariantId,
          shopifyVariantTitle: variant.title,
          reason: `Formato '${matchedFormat.displayName}' existe pero no hay registro de vínculo (re-sincronizar)`,
        });
      }
    }

    return {
      product: { id: product.id, displayName: product.displayName },
      linkedVariants,
      unlinkedVariants,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 409, description: 'Shopify product ID already exists' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':productId')
  @ApiOperation({ summary: 'Update a product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 409, description: 'Shopify product ID already exists' })
  update(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(productId, dto);
  }

  @Delete(':productId')
  @ApiOperation({ summary: 'Soft delete a product (sets isActive = false)' })
  @ApiResponse({ status: 200, description: 'Product deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  softDelete(@Param('productId') productId: string) {
    return this.productsService.softDelete(productId);
  }
}
