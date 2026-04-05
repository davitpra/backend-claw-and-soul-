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
      select: { format: true },
      distinct: ['formatId'],
    });
    return entries.map((e) => e.format);
  }

  async getStylesByProductAndFormat(productId: string, formatId: string) {
    const entries = await this.prisma.styleFormatProductCompat.findMany({
      where: { productRefId: productId, formatId, isActive: true },
      select: { style: true },
      distinct: ['styleId'],
    });
    return entries.map((e) => e.style);
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
    });
    if (!rule || !rule.isActive) return { compatible: false };
    return { compatible: true, rule };
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
}
