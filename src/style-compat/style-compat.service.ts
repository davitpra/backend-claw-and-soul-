import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StyleCompatService {
  constructor(private prisma: PrismaService) {}

  async findCompatibleOptions(styleId: string) {
    const style = await this.prisma.style.findUnique({ where: { id: styleId } });
    if (!style) {
      throw new NotFoundException(`Style ${styleId} not found`);
    }

    const entries = await this.prisma.styleFormatProductCompat.findMany({
      where: { styleId, isActive: true },
      include: {
        format: true,
        productRef: true,
      },
      orderBy: [{ formatId: 'asc' }, { productRefId: 'asc' }],
    });

    const formatsMap = new Map<string, (typeof entries)[0]['format']>();
    const productRefsMap = new Map<string, (typeof entries)[0]['productRef']>();

    for (const entry of entries) {
      formatsMap.set(entry.format.id, entry.format);
      productRefsMap.set(entry.productRef.id, entry.productRef);
    }

    return {
      styleId,
      formats: Array.from(formatsMap.values()),
      productReferences: Array.from(productRefsMap.values()),
      compatMatrix: entries.map((e) => ({
        id: e.id,
        formatId: e.formatId,
        productRefId: e.productRefId,
        constraints: e.constraints,
      })),
    };
  }
}
