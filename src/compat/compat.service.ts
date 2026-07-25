import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { derivePreviewUrl } from '../styles/style-preview.util';
import { PUBLIC_STYLE_SELECT } from '../styles/style-select';

// `/compat/styles` es `@Public()`: el estilo va proyectado para no filtrar el
// promptTemplate ni el resto de la config del pipeline.
const STYLE_SELECT = {
  ...PUBLIC_STYLE_SELECT,
  images: {
    where: { isPrimary: true },
    take: 1,
    select: { imageUrl: true, isPrimary: true },
  },
};

@Injectable()
export class CompatService {
  constructor(private prisma: PrismaService) {}

  // --- Flujo 1: producto → formatos disponibles ---

  async getFormatsByProduct(productId: string) {
    const variants = await this.prisma.productFormatVariant.findMany({
      where: { productRefId: productId, isActive: true },
      include: { format: true },
      distinct: ['formatId'],
    });

    return variants.map((v) => ({
      ...v.format,
      shopifyVariantId: v.shopifyVariantId,
      shopifyVariantTitle: v.shopifyVariantTitle,
      constraints: v.constraints ?? null,
    }));
  }

  // Flujo 1 step 2: dado producto+formato devuelve el estilo único del producto
  async getStylesByProductAndFormat(productId: string, _formatId: string) {
    const product = await this.prisma.productReference.findUnique({
      where: { id: productId },
      include: { style: { select: STYLE_SELECT } },
    });

    if (!product) throw new NotFoundException(`Product ${productId} not found`);
    if (!product.style) return [];

    const { images, ...styleRest } = product.style;
    const style = {
      ...styleRest,
      previewUrl: derivePreviewUrl(images),
    };

    return [style];
  }

  // --- Flujo 2: estilo → formatos disponibles ---

  async getFormatsByStyle(styleId: string) {
    // All formats reachable through products that carry this style
    const variants = await this.prisma.productFormatVariant.findMany({
      where: {
        isActive: true,
        productRef: { styleId, isActive: true },
      },
      include: { format: true },
      distinct: ['formatId'],
    });

    return variants.map((v) => v.format);
  }

  // Flujo 2 step 2: dado estilo+formato devuelve los productos compatibles
  async getProductsByStyleAndFormat(styleId: string, formatId: string) {
    const products = await this.prisma.productReference.findMany({
      where: {
        styleId,
        isActive: true,
        productVariants: {
          some: { formatId, isActive: true },
        },
      },
    });

    return products;
  }

  // --- Validación ---

  async checkCompat(styleId: string, formatId: string, productId: string) {
    const product = await this.prisma.productReference.findUnique({
      where: { id: productId },
      include: { style: true },
    });

    if (!product || !product.isActive || product.styleId !== styleId) {
      return { compatible: false };
    }

    const variant = await this.prisma.productFormatVariant.findFirst({
      where: { productRefId: productId, formatId, isActive: true },
      include: { format: true },
    });

    if (!variant) return { compatible: false };

    return {
      compatible: true,
      format: variant.format,
      shopifyVariantId: variant.shopifyVariantId,
      constraints: variant.constraints ?? null,
    };
  }
}
