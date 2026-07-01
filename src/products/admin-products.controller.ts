import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { LinkVariantDto } from './dto/link-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ShopifyApiService } from '../shopify-sync/shopify-api.service';
import { ProductSyncService } from '../shopify-sync/product-sync.service';
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
    private readonly productSyncService: ProductSyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all products including inactive (admin)' })
  @ApiResponse({ status: 200, description: 'Products retrieved' })
  findAll() {
    return this.productsService.findAllForAdmin();
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Get a single product by id (admin)' })
  @ApiResponse({ status: 200, description: 'Product retrieved' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('productId') productId: string) {
    return this.productsService.findOne(productId);
  }

  @Post(':productId/variants/link')
  @ApiOperation({ summary: 'Manually link a Shopify variant to a format' })
  @ApiResponse({ status: 201, description: 'Variant linked successfully' })
  @ApiResponse({ status: 404, description: 'Product or format not found' })
  linkVariant(
    @Param('productId') productId: string,
    @Body() dto: LinkVariantDto,
  ) {
    return this.productsService.linkVariant(productId, dto);
  }

  @Patch(':productId/variants/:shopifyVariantId')
  @ApiOperation({
    summary:
      'Update an existing variant link (change format or toggle isActive)',
  })
  @ApiResponse({ status: 200, description: 'Variant link updated' })
  @ApiResponse({
    status: 404,
    description: 'Product, variant link, or format not found',
  })
  updateVariantLink(
    @Param('productId') productId: string,
    @Param('shopifyVariantId') shopifyVariantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.productsService.updateVariantLink(
      productId,
      shopifyVariantId,
      dto,
    );
  }

  @Get(':productId/variants')
  @ApiOperation({
    summary: 'Get linked and unlinked Shopify variants for a product',
  })
  @ApiResponse({ status: 200, description: 'Variant link status retrieved' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getVariantLinks(@Param('productId') productId: string) {
    const product = await this.productsService.findOne(productId);

    // Get all linked variants from DB
    const dbVariants = await this.prisma.productFormatVariant.findMany({
      where: { productRefId: productId },
      include: {
        format: {
          select: { id: true, displayName: true, shopifyVariantOption: true },
        },
      },
    });

    const linkedVariantsMap = new Map(
      dbVariants.map((v) => [v.shopifyVariantId, v]),
    );

    // Fetch live variants from Shopify
    const shopifyProduct = await this.shopifyApiService.fetchProductById(
      product.shopifyProductId,
    );

    if (!shopifyProduct) {
      // Shopify unreachable — return only what we have in DB
      return {
        product: { id: product.id, displayName: product.displayName },
        linkedVariants: dbVariants.map((v) => ({
          id: v.id,
          format: { id: v.format.id, displayName: v.format.displayName },
          shopifyVariantId: v.shopifyVariantId,
          shopifyVariantTitle: v.shopifyVariantTitle,
          isActive: v.isActive,
          podProvider: v.podProvider ?? null,
          podConfig: v.podConfig ?? null,
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
          id: dbVariant.id,
          format: {
            id: dbVariant.format.id,
            displayName: dbVariant.format.displayName,
          },
          shopifyVariantId,
          shopifyVariantTitle: variant.title,
          isActive: dbVariant.isActive,
          podConfig: dbVariant.podConfig ?? null,
          podProvider: dbVariant.podProvider ?? null,
        });
        continue;
      }

      // Not linked — determine why
      if (!sizeValue) {
        unlinkedVariants.push({
          shopifyVariantId,
          shopifyVariantTitle: variant.title,
          shopifyVariantOption: null,
          reason: 'La variante no tiene opción de tamaño (option1 vacío)',
        });
        continue;
      }

      const matchedFormat = formatByOption.get(sizeValue);
      if (!matchedFormat) {
        unlinkedVariants.push({
          shopifyVariantId,
          shopifyVariantTitle: variant.title,
          shopifyVariantOption: sizeValue,
          reason: `No hay formato configurado para '${sizeValue}'`,
        });
      } else {
        unlinkedVariants.push({
          shopifyVariantId,
          shopifyVariantTitle: variant.title,
          shopifyVariantOption: sizeValue,
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

  @Post(':productId/variants/sync')
  @ApiOperation({
    summary: 'Re-fetch Shopify variants for a product and auto-link to formats',
  })
  @ApiResponse({ status: 200, description: 'Variants resynced' })
  @ApiResponse({
    status: 404,
    description: 'Product not found in DB or Shopify',
  })
  async syncVariants(@Param('productId') productId: string) {
    const product = await this.productsService.findOne(productId);
    const shopifyProduct = await this.shopifyApiService.fetchProductById(
      product.shopifyProductId,
    );
    if (!shopifyProduct) {
      throw new NotFoundException(
        `Producto no encontrado en Shopify (id ${product.shopifyProductId})`,
      );
    }
    return this.productSyncService.syncVariants(
      product.id,
      shopifyProduct.variants,
      product.displayName,
    );
  }

  @Get('pending-style')
  @ApiOperation({
    summary: 'List active products that have no style assigned yet',
  })
  @ApiResponse({
    status: 200,
    description: 'Products pending style assignment',
  })
  findPendingStyleAssignment() {
    return this.productsService.findPendingStyleAssignment();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({
    status: 409,
    description: 'Shopify product ID already exists',
  })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':productId')
  @ApiOperation({ summary: 'Update a product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({
    status: 409,
    description: 'Shopify product ID already exists',
  })
  update(@Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(productId, dto);
  }

  @Delete(':productId')
  @ApiOperation({ summary: 'Soft delete a product (sets isActive = false)' })
  @ApiResponse({ status: 200, description: 'Product deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  softDelete(@Param('productId') productId: string) {
    return this.productsService.softDelete(productId);
  }

  @Delete(':productId/permanent')
  @ApiOperation({ summary: 'Permanently delete a product from the database' })
  @ApiResponse({ status: 200, description: 'Product deleted permanently' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  hardDelete(@Param('productId') productId: string) {
    return this.productsService.hardDelete(productId);
  }
}
