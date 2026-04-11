import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

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
      orderBy: { name: 'asc' },
    });
  }

  async findByHandleWithVariants(handle: string) {
    const product = await this.prisma.productReference.findFirst({
      where: { shopifyHandle: handle, isActive: true },
      include: {
        productVariants: {
          where: { isActive: true },
          include: { format: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with handle '${handle}' not found`);
    }

    return {
      productRefId: product.id,
      shopifyProductId: product.shopifyProductId,
      shopifyHandle: product.shopifyHandle,
      name: product.name,
      displayName: product.displayName,
      description: product.description,
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
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async create(dto: CreateProductDto) {
    try {
      return await this.prisma.productReference.create({ data: dto });
    } catch (error) {
      if (error.code === 'P2002') {
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
      });
    } catch (error) {
      if (error.code === 'P2002') {
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
