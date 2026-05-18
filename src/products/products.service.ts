import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const PRODUCT_INCLUDE = {
  style: { select: { id: true, name: true, displayName: true, previewUrl: true } },
  productType: { select: { id: true, name: true, displayName: true } },
};

function toShopifyVariantGid(id: string): string {
  if (id.startsWith('gid://')) return id;
  return `gid://shopify/ProductVariant/${id}`;
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.productReference.findMany({
      where: { isActive: true },
      include: PRODUCT_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  findPendingStyleAssignment() {
    return this.prisma.productReference.findMany({
      where: { isActive: true, styleId: null },
      include: PRODUCT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByHandleWithVariants(handle: string) {
    const product = await this.prisma.productReference.findFirst({
      where: { shopifyHandle: handle, isActive: true },
      include: {
        ...PRODUCT_INCLUDE,
        productVariants: {
          where: { isActive: true },
          include: { format: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with handle '${handle}' not found`);
    }

    // Deduplicate by formatId — multiple Shopify variants may share the same size.
    // The IA-generator only needs one entry per format; exposing all variants per
    // format is deferred to the future secondary-option UI work.
    const seenFormats = new Map<string, (typeof product.productVariants)[0]>();
    for (const v of product.productVariants) {
      if (!seenFormats.has(v.format.id)) seenFormats.set(v.format.id, v);
    }

    return {
      productRefId: product.id,
      shopifyProductId: product.shopifyProductId,
      shopifyHandle: product.shopifyHandle,
      name: product.name,
      displayName: product.displayName,
      description: product.description,
      style: product.style,
      productType: product.productType,
      variants: [...seenFormats.values()].map((v) => ({
        shopifyVariantId: toShopifyVariantGid(v.shopifyVariantId),
        shopifyVariantTitle: v.shopifyVariantTitle,
        formatId: v.format.id,
        formatName: v.format.name,
        formatDisplayName: v.format.displayName,
        aspectRatio: v.format.aspectRatio,
        width: v.format.width,
        height: v.format.height,
      })),
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.productReference.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async create(dto: CreateProductDto) {
    try {
      return await this.prisma.productReference.create({
        data: dto,
        include: PRODUCT_INCLUDE,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A product with this Shopify product ID already exists',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);

    try {
      return await this.prisma.productReference.update({
        where: { id },
        data: dto,
        include: PRODUCT_INCLUDE,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A product with this Shopify product ID already exists',
        );
      }
      throw error;
    }
  }

  async softDelete(id: string) {
    await this.findOne(id);
    return this.prisma.productReference.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
