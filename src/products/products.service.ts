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
      category: true,
      difficulty: true,
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
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with handle '${handle}' not found`);
    }

    // Expose every active variant (not just one per format). Several Shopify
    // variants can share the same format/size (e.g. different "Type" finishes:
    // Rolled / Wrapped / Framed); each must be personalizable, so the storefront
    // and IA-generator can match any selected variant by its shopifyVariantId.
    // Consumers that only care about the format dedupe client-side by formatId.
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
      artKind: product.artKind,
      showcaseCollectionHandle: product.showcaseCollectionHandle,
      variants: product.productVariants.map((v) => ({
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

  /** The single active product flagged as the Paint-by-Numbers kit, with its variants. */
  async findPbnProduct() {
    const product = await this.prisma.productReference.findFirst({
      where: { isPaintByNumbers: true, isActive: true },
      // Determinista: si por datos legacy hubiera varios marcados, gana el más
      // reciente. La escritura garantiza unicidad vía setPbnProduct.
      orderBy: { updatedAt: 'desc' },
      include: {
        ...PRODUCT_INCLUDE,
        productVariants: {
          where: { isActive: true },
          include: { format: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('No Paint-by-Numbers product configured');
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
      artKind: product.artKind,
      variants: product.productVariants.map((v) => ({
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

  /**
   * Fija EL producto dedicado al kit Paint-by-Numbers (o ninguno si productId
   * es null), garantizando unicidad: desmarca cualquier otro que estuviera
   * marcado dentro de la misma transacción.
   */
  async setPbnProduct(productId: string | null) {
    if (productId) await this.findOne(productId);
    return this.prisma.$transaction(async (tx) => {
      await tx.productReference.updateMany({
        where: {
          isPaintByNumbers: true,
          ...(productId ? { id: { not: productId } } : {}),
        },
        data: { isPaintByNumbers: false },
      });
      if (productId) {
        await tx.productReference.update({
          where: { id: productId },
          data: { isPaintByNumbers: true },
        });
      }
    });
  }

  /**
   * Fija EL producto dedicado al pack de créditos (o ninguno si productId es
   * null), garantizando unicidad como setPbnProduct.
   */
  async setCreditPackProduct(productId: string | null) {
    if (productId) await this.findOne(productId);
    return this.prisma.$transaction(async (tx) => {
      await tx.productReference.updateMany({
        where: {
          isCreditPack: true,
          ...(productId ? { id: { not: productId } } : {}),
        },
        data: { isCreditPack: false },
      });
      if (productId) {
        await tx.productReference.update({
          where: { id: productId },
          data: { isCreditPack: true },
        });
      }
    });
  }

  /** El único producto activo marcado como pack de créditos, con sus variantes. */
  async findCreditPackProduct() {
    const product = await this.prisma.productReference.findFirst({
      where: { isCreditPack: true, isActive: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        creditPackVariants: { orderBy: { creditAmount: 'asc' } },
      },
    });

    if (!product) {
      throw new NotFoundException('No credit pack product configured');
    }

    return {
      productRefId: product.id,
      shopifyProductId: product.shopifyProductId,
      shopifyHandle: product.shopifyHandle,
      name: product.name,
      displayName: product.displayName,
      description: product.description,
      template: product.template,
      artKind: product.artKind,
      variants: product.creditPackVariants.map((v) => ({
        shopifyVariantId: toShopifyVariantGid(v.shopifyVariantId),
        creditAmount: v.creditAmount,
      })),
    };
  }

  /** Mapeo variante→créditos guardado en DB (IDs numéricos). */
  async getCreditPackVariantRows(productRefId: string) {
    return this.prisma.creditPackVariant.findMany({
      where: { productRefId },
      select: { shopifyVariantId: true, creditAmount: true },
    });
  }

  /**
   * Reemplaza por completo el mapeo variante→créditos de un producto pack:
   * upsert de las entradas provistas y borrado de las ausentes. El producto
   * debe existir y estar marcado como pack.
   */
  async setCreditPackVariants(
    productId: string,
    variants: { shopifyVariantId: string; creditAmount: number }[],
  ) {
    const product = await this.prisma.productReference.findUnique({
      where: { id: productId },
      select: { id: true, isCreditPack: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.isCreditPack) {
      throw new ConflictException('Product is not marked as a credit pack');
    }

    const keep = variants.map((v) => v.shopifyVariantId);
    return this.prisma.$transaction(async (tx) => {
      await tx.creditPackVariant.deleteMany({
        where: {
          productRefId: productId,
          ...(keep.length > 0 ? { shopifyVariantId: { notIn: keep } } : {}),
        },
      });
      for (const v of variants) {
        await tx.creditPackVariant.upsert({
          where: { shopifyVariantId: v.shopifyVariantId },
          create: {
            productRefId: productId,
            shopifyVariantId: v.shopifyVariantId,
            creditAmount: v.creditAmount,
          },
          update: { productRefId: productId, creditAmount: v.creditAmount },
        });
      }
      return tx.creditPackVariant.findMany({
        where: { productRefId: productId },
        select: { shopifyVariantId: true, creditAmount: true },
      });
    });
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
}
