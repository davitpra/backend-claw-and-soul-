import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { LinkVariantDto } from './dto/link-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { derivePreviewUrl } from '../styles/style-preview.util';

const PRODUCT_INCLUDE = {
  style: {
    select: {
      id: true,
      name: true,
      displayName: true,
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { imageUrl: true, isPrimary: true },
      },
    },
  },
};

type WithStylePreview<
  T extends {
    style: { images: { imageUrl: string; isPrimary: boolean }[] } | null;
  },
> = Omit<T, 'style'> & {
  style:
    | (Omit<NonNullable<T['style']>, 'images'> & { previewUrl: string | null })
    | null;
};

function addStylePreview<
  T extends {
    style: { images: { imageUrl: string; isPrimary: boolean }[] } | null;
  },
>(product: T): WithStylePreview<T> {
  if (!product.style)
    return { ...product, style: null } as unknown as WithStylePreview<T>;
  const { images, ...rest } = product.style;
  return {
    ...product,
    style: { ...rest, previewUrl: derivePreviewUrl(images) },
  } as unknown as WithStylePreview<T>;
}

function toShopifyVariantGid(id: string): string {
  if (id.startsWith('gid://')) return id;
  return `gid://shopify/ProductVariant/${id}`;
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.productReference.findMany({
      where: { isActive: true },
      include: PRODUCT_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return rows.map(addStylePreview);
  }

  async findAllForAdmin() {
    const rows = await this.prisma.productReference.findMany({
      include: PRODUCT_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return rows.map(addStylePreview);
  }

  async findPendingStyleAssignment() {
    const rows = await this.prisma.productReference.findMany({
      where: { isActive: true, styleId: null },
      include: PRODUCT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(addStylePreview);
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

    const mapped = addStylePreview(product);

    return {
      productRefId: product.id,
      shopifyProductId: product.shopifyProductId,
      shopifyHandle: product.shopifyHandle,
      name: product.name,
      displayName: product.displayName,
      description: product.description,
      style: mapped.style,
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

    return addStylePreview(product);
  }

  async create(dto: CreateProductDto) {
    try {
      const row = await this.prisma.productReference.create({
        data: dto,
        include: PRODUCT_INCLUDE,
      });
      return addStylePreview(row);
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
      const row = await this.prisma.productReference.update({
        where: { id },
        data: dto,
        include: PRODUCT_INCLUDE,
      });
      return addStylePreview(row);
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

  async hardDelete(id: string) {
    await this.findOne(id);
    return this.prisma.productReference.delete({ where: { id } });
  }

  async linkVariant(productRefId: string, dto: LinkVariantDto) {
    await this.findOne(productRefId);
    const format = await this.prisma.format.findUnique({
      where: { id: dto.formatId },
    });
    if (!format) throw new NotFoundException('Format not found');

    const linked = await this.prisma.productFormatVariant.upsert({
      where: {
        productRefId_shopifyVariantId: {
          productRefId,
          shopifyVariantId: dto.shopifyVariantId,
        },
      },
      create: {
        productRefId,
        formatId: dto.formatId,
        shopifyVariantId: dto.shopifyVariantId,
        shopifyVariantTitle: dto.shopifyVariantTitle,
        isActive: true,
      },
      update: {
        formatId: dto.formatId,
        shopifyVariantTitle: dto.shopifyVariantTitle,
        isActive: true,
      },
      include: { format: { select: { id: true, displayName: true } } },
    });

    if (dto.shopifyVariantOption?.trim()) {
      await this.prisma.format.update({
        where: { id: dto.formatId },
        data: { shopifyVariantOption: dto.shopifyVariantOption.trim() },
      });
    }

    return linked;
  }

  async updateVariantLink(
    productRefId: string,
    shopifyVariantId: string,
    dto: UpdateProductVariantDto,
  ) {
    await this.findOne(productRefId);

    const existing = await this.prisma.productFormatVariant.findUnique({
      where: {
        productRefId_shopifyVariantId: { productRefId, shopifyVariantId },
      },
    });
    if (!existing) throw new NotFoundException('Variant link not found');

    if (dto.formatId !== undefined) {
      const format = await this.prisma.format.findUnique({
        where: { id: dto.formatId },
      });
      if (!format) throw new NotFoundException('Format not found');
    }

    const data: { formatId?: string; isActive?: boolean } = {};
    if (dto.formatId !== undefined) data.formatId = dto.formatId;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (Object.keys(data).length === 0) {
      return this.prisma.productFormatVariant.findUnique({
        where: {
          productRefId_shopifyVariantId: { productRefId, shopifyVariantId },
        },
        include: { format: { select: { id: true, displayName: true } } },
      });
    }

    return this.prisma.productFormatVariant.update({
      where: {
        productRefId_shopifyVariantId: { productRefId, shopifyVariantId },
      },
      data,
      include: { format: { select: { id: true, displayName: true } } },
    });
  }
}
