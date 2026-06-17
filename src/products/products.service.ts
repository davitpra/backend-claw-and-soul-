import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { LinkVariantDto } from './dto/link-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
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
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

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
        images: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
          include: {
            productFormatVariant: { select: { shopifyVariantId: true } },
          },
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
      template: product.template,
      showcaseCollectionHandle: product.showcaseCollectionHandle,
      images: product.images.map((img) => ({
        id: img.id,
        productFormatVariantId: img.productFormatVariantId,
        // GID matching selectedVariantId in the storefront; null = General.
        shopifyVariantId: img.productFormatVariant
          ? toShopifyVariantGid(img.productFormatVariant.shopifyVariantId)
          : null,
        imageUrl: img.imageUrl,
        type: img.type,
        altImage: img.altImage,
        isPrimary: img.isPrimary,
        orderIndex: img.orderIndex,
      })),
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
        podConfig: dto.podConfig
          ? (dto.podConfig as unknown as Prisma.InputJsonValue)
          : undefined,
        isActive: true,
      },
      update: {
        formatId: dto.formatId,
        shopifyVariantTitle: dto.shopifyVariantTitle,
        podConfig: dto.podConfig
          ? (dto.podConfig as unknown as Prisma.InputJsonValue)
          : undefined,
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

    const data: {
      formatId?: string;
      isActive?: boolean;
      podProvider?: string | null;
      podConfig?: Prisma.InputJsonValue;
    } = {};
    if (dto.formatId !== undefined) data.formatId = dto.formatId;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.podProvider !== undefined) data.podProvider = dto.podProvider;
    if (dto.podConfig !== undefined)
      data.podConfig = dto.podConfig as unknown as Prisma.InputJsonValue;

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

  // ── Contextual images (app-owned, not synced from Shopify) ──────────────

  async listImages(productRefId: string, productFormatVariantId?: string) {
    await this.findOne(productRefId);
    return this.prisma.productImage.findMany({
      where: {
        productRefId,
        ...(productFormatVariantId ? { productFormatVariantId } : {}),
      },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // Ensures the Shopify variant (ProductFormatVariant) belongs to this product
  // before associating an image with it. Throws 400 otherwise.
  private async assertVariantBelongsToProduct(
    productRefId: string,
    productFormatVariantId: string,
  ) {
    const variant = await this.prisma.productFormatVariant.findFirst({
      where: { id: productFormatVariantId, productRefId },
      select: { id: true },
    });
    if (!variant) {
      throw new BadRequestException('La variante no pertenece a este producto');
    }
  }

  async addImage(
    productRefId: string,
    file: Express.Multer.File,
    type?: string,
    altImage?: string,
    orderIndex?: number,
    productFormatVariantId?: string,
  ) {
    await this.findOne(productRefId);
    if (productFormatVariantId) {
      await this.assertVariantBelongsToProduct(
        productRefId,
        productFormatVariantId,
      );
    }

    const key = `products/${productRefId}/${uuidv4()}`;
    const imageUrl = await this.storageService.upload(
      key,
      file.buffer,
      file.mimetype,
    );

    return this.prisma.productImage.create({
      data: {
        productRefId,
        productFormatVariantId: productFormatVariantId ?? null,
        imageUrl,
        storageKey: key,
        type: type ?? 'scene',
        altImage,
        orderIndex: orderIndex ?? 0,
      },
    });
  }

  async updateImage(
    productRefId: string,
    imgId: string,
    dto: UpdateProductImageDto,
  ) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imgId, productRefId },
    });

    if (!image) {
      throw new NotFoundException('Product image not found');
    }

    if (
      dto.productFormatVariantId !== undefined &&
      dto.productFormatVariantId !== null
    ) {
      await this.assertVariantBelongsToProduct(
        productRefId,
        dto.productFormatVariantId,
      );
    }

    // "Primary" is scoped per variant bucket, so reset only within the same
    // variant (the bucket the image belongs to, or the one it's moving to).
    const targetVariantId =
      dto.productFormatVariantId !== undefined
        ? dto.productFormatVariantId
        : image.productFormatVariantId;
    if (dto.isPrimary === true) {
      await this.prisma.productImage.updateMany({
        where: { productRefId, productFormatVariantId: targetVariantId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.productImage.update({
      where: { id: imgId },
      data: {
        ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
        ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
        ...(dto.altImage !== undefined && { altImage: dto.altImage }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.productFormatVariantId !== undefined && {
          productFormatVariantId: dto.productFormatVariantId,
        }),
      },
    });
  }

  async removeImage(productRefId: string, imgId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imgId, productRefId },
    });

    if (!image) {
      throw new NotFoundException('Product image not found');
    }

    await this.storageService.delete(image.storageKey);
    return this.prisma.productImage.delete({ where: { id: imgId } });
  }
}
