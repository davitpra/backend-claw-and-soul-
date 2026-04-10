import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompatRuleDto } from './dto/create-compat-rule.dto';
import { UpdateCompatRuleDto } from './dto/update-compat-rule.dto';
import { BulkCreateCompatRulesDto } from './dto/bulk-create-compat-rules.dto';

@Injectable()
export class CompatService {
  constructor(private prisma: PrismaService) {}

  // --- PUBLIC ---

  async getFormatsByProduct(productId: string) {
    const entries = await this.prisma.styleFormatProductCompat.findMany({
      where: { productRefId: productId, isActive: true },
      select: {
        format: true,
        formatId: true,
      },
      distinct: ['formatId'],
    });

    const variantMap = await this.buildVariantMap(
      productId,
      entries.map((e) => e.formatId),
    );

    return entries.map((e) => ({
      ...e.format,
      shopifyVariantId: variantMap[e.formatId]?.shopifyVariantId ?? null,
      shopifyVariantOption: e.format.shopifyVariantOption ?? null,
    }));
  }

  async getStylesByProductAndFormat(productId: string, formatId: string) {
    const entries = await this.prisma.styleFormatProductCompat.findMany({
      where: { productRefId: productId, formatId, isActive: true },
      select: {
        style: {
          include: {
            images: {
              where: { isPrimary: true },
              take: 1,
              select: { imageUrl: true },
            },
          },
        },
      },
      distinct: ['styleId'],
    });
    return entries
      .map((e) => e.style)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getFormatsByStyle(styleId: string) {
    const entries = await this.prisma.styleFormatProductCompat.findMany({
      where: { styleId, isActive: true },
      select: { format: true },
      distinct: ['formatId'],
    });
    return entries.map((e) => e.format);
  }

  async getProductsByStyleAndFormat(styleId: string, formatId: string) {
    const entries = await this.prisma.styleFormatProductCompat.findMany({
      where: { styleId, formatId, isActive: true },
      select: { productRef: true },
      distinct: ['productRefId'],
    });
    return entries.map((e) => e.productRef);
  }

  async checkCompat(styleId: string, formatId: string, productId: string) {
    const rule = await this.prisma.styleFormatProductCompat.findUnique({
      where: {
        styleId_formatId_productRefId: { styleId, formatId, productRefId: productId },
      },
      include: { format: true },
    });

    if (!rule || !rule.isActive) return { compatible: false };

    const variant = await this.prisma.productFormatVariant.findUnique({
      where: { productRefId_formatId: { productRefId: productId, formatId } },
    });

    return {
      compatible: true,
      format: rule.format,
      shopifyVariantId: variant?.isActive ? variant.shopifyVariantId : null,
      constraints: rule.constraints ?? null,
    };
  }

  // --- ADMIN ---

  async findAll(styleId?: string, formatId?: string, productId?: string) {
    const where: Record<string, string> = {};
    if (styleId) where.styleId = styleId;
    if (formatId) where.formatId = formatId;
    if (productId) where.productRefId = productId;

    return this.prisma.styleFormatProductCompat.findMany({
      where,
      include: {
        style: { select: { id: true, name: true, displayName: true } },
        format: { select: { id: true, name: true, displayName: true } },
        productRef: { select: { id: true, name: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateCompatRuleDto) {
    return this.prisma.styleFormatProductCompat.create({
      data: {
        styleId: dto.style_id,
        formatId: dto.format_id,
        productRefId: dto.product_ref_id,
        constraints: dto.constraints,
      },
    });
  }

  async update(compatId: string, dto: UpdateCompatRuleDto) {
    const rule = await this.prisma.styleFormatProductCompat.findUnique({
      where: { id: compatId },
    });
    if (!rule) throw new NotFoundException(`Compat rule ${compatId} not found`);

    const data: { constraints?: Record<string, any>; isActive?: boolean } = {};
    if (dto.constraints !== undefined) data.constraints = dto.constraints;
    if (dto.is_active !== undefined) data.isActive = dto.is_active;

    return this.prisma.styleFormatProductCompat.update({ where: { id: compatId }, data });
  }

  async remove(compatId: string) {
    const rule = await this.prisma.styleFormatProductCompat.findUnique({
      where: { id: compatId },
    });
    if (!rule) throw new NotFoundException(`Compat rule ${compatId} not found`);

    return this.prisma.styleFormatProductCompat.delete({ where: { id: compatId } });
  }

  async bulkCreate(dto: BulkCreateCompatRulesDto) {
    return this.prisma.styleFormatProductCompat.createMany({
      data: dto.rules.map((r) => ({
        styleId: r.style_id,
        formatId: r.format_id,
        productRefId: r.product_ref_id,
        constraints: r.constraints,
      })),
      skipDuplicates: true,
    });
  }

  // --- PRIVATE ---

  private async buildVariantMap(
    productRefId: string,
    formatIds: string[],
  ): Promise<Record<string, { shopifyVariantId: string }>> {
    if (formatIds.length === 0) return {};

    const variants = await this.prisma.productFormatVariant.findMany({
      where: { productRefId, formatId: { in: formatIds }, isActive: true },
      select: { formatId: true, shopifyVariantId: true },
    });

    return Object.fromEntries(variants.map((v) => [v.formatId, { shopifyVariantId: v.shopifyVariantId }]));
  }
}
