import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';

// Normalize optional fields so dedup compares null === null (not undefined).
const norm = (v?: string | null) => v ?? null;

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  /** Resolve the user's cart, creating an empty one on first access. */
  private async findOrCreateCart(userId: string) {
    const existing = await this.prisma.cart.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.cart.create({ data: { userId } });
  }

  /** Return the user's cart with items in the shape the frontend expects. */
  async getCart(userId: string) {
    const cart = await this.findOrCreateCart(userId);
    return this.serialize(cart.id, userId);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const cart = await this.findOrCreateCart(userId);

    const existing = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        variantId: dto.variantId,
        style: norm(dto.style),
        size: norm(dto.size),
      },
    });

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + (dto.quantity ?? 1) },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: dto.variantId,
          name: dto.name,
          size: norm(dto.size),
          style: norm(dto.style),
          color: norm(dto.color),
          price: dto.price,
          quantity: dto.quantity ?? 1,
          img: dto.img,
          generationId: norm(dto.generationId),
          paintByNumbersId: norm(dto.paintByNumbersId),
          imageUrl: norm(dto.imageUrl),
        },
      });
    }

    return this.serialize(cart.id, userId);
  }

  /** Apply a quantity delta to every item with the given variantId (min 1). */
  async updateQuantity(userId: string, variantId: string, delta: number) {
    const cart = await this.findOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id, variantId },
    });

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.cartItem.update({
          where: { id: item.id },
          data: { quantity: Math.max(1, item.quantity + delta) },
        }),
      ),
    );

    return this.serialize(cart.id, userId);
  }

  async removeItem(userId: string, variantId: string) {
    const cart = await this.findOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id, variantId },
    });
    return this.serialize(cart.id, userId);
  }

  async clear(userId: string) {
    const cart = await this.findOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.serialize(cart.id, userId);
  }

  /** Set imageUrl/img on items matching a generationId that don't have one yet. */
  async updateImage(userId: string, generationId: string, imageUrl: string) {
    const cart = await this.findOrCreateCart(userId);
    await this.prisma.cartItem.updateMany({
      where: { cartId: cart.id, generationId, imageUrl: null },
      data: { imageUrl, img: imageUrl },
    });
    return this.serialize(cart.id, userId);
  }

  /** Merge guest items into the user's cart (used on login). */
  async merge(userId: string, items: AddCartItemDto[]) {
    for (const item of items) {
      await this.addItem(userId, item);
    }
    return this.getCart(userId);
  }

  private async serialize(cartId: string, userId: string) {
    const items = await this.prisma.cartItem.findMany({
      where: { cartId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      id: cartId,
      userId,
      items: items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        name: item.name,
        size: item.size ?? undefined,
        style: item.style ?? undefined,
        color: item.color ?? undefined,
        price: Number(item.price),
        quantity: item.quantity,
        img: item.img,
        generationId: item.generationId ?? undefined,
        paintByNumbersId: item.paintByNumbersId ?? undefined,
        imageUrl: item.imageUrl ?? undefined,
      })),
    };
  }
}
