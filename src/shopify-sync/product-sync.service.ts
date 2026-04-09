import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyProductPayload, ShopifyVariant } from './dto/shopify-product.dto';

@Injectable()
export class ProductSyncService {
  private readonly logger = new Logger(ProductSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertProduct(
    shopifyProduct: ShopifyProductPayload,
  ): Promise<{ action: 'created' | 'updated'; id: string }> {
    const shopifyProductId = String(shopifyProduct.id);
    const data = {
      name: shopifyProduct.handle,
      shopifyHandle: shopifyProduct.handle,
      displayName: shopifyProduct.title,
      description: this.stripHtml(shopifyProduct.body_html),
      isActive: shopifyProduct.status === 'active',
    };

    const existing = await this.prisma.productReference.findUnique({
      where: { shopifyProductId },
    });

    if (existing) {
      await this.prisma.productReference.update({
        where: { id: existing.id },
        data,
      });
      await this.writeAuditLog('product_sync_updated', existing.id);
      this.logger.debug(`Updated product ${shopifyProductId} (id: ${existing.id})`);
      return { action: 'updated', id: existing.id };
    } else {
      const created = await this.prisma.productReference.create({
        data: { shopifyProductId, ...data },
      });
      await this.writeAuditLog('product_sync_created', created.id);
      this.logger.debug(`Created product ${shopifyProductId} (id: ${created.id})`);
      return { action: 'created', id: created.id };
    }
  }

  async syncVariants(
    productRefId: string,
    variants: ShopifyVariant[],
    productName: string,
  ): Promise<{ synced: number; skipped: number }> {
    let synced = 0;
    let skipped = 0;

    const incomingVariantIds = variants.map((v) => String(v.id));

    for (const variant of variants) {
      // Extract the Size option (option1 is typically "Size" for print products)
      const sizeValue = variant.option1?.trim();

      if (!sizeValue) {
        this.logger.warn(
          `Variant ${variant.id} of product '${productName}' has no size option — skipping`,
        );
        skipped++;
        continue;
      }

      const format = await this.prisma.format.findFirst({
        where: { shopifyVariantOption: sizeValue },
      });

      if (!format) {
        this.logger.warn(
          `Variant '${sizeValue}' of product '${productName}' has no configured format — skipping`,
        );
        skipped++;
        continue;
      }

      await this.prisma.productFormatVariant.upsert({
        where: { productRefId_formatId: { productRefId, formatId: format.id } },
        create: {
          productRefId,
          formatId: format.id,
          shopifyVariantId: String(variant.id),
          shopifyVariantTitle: variant.title,
          isActive: true,
        },
        update: {
          shopifyVariantId: String(variant.id),
          shopifyVariantTitle: variant.title,
          isActive: true,
        },
      });

      synced++;
    }

    // Deactivate variants that are no longer present in Shopify
    await this.prisma.productFormatVariant.updateMany({
      where: {
        productRefId,
        shopifyVariantId: { notIn: incomingVariantIds },
        isActive: true,
      },
      data: { isActive: false },
    });

    return { synced, skipped };
  }

  async softDeleteProduct(
    shopifyProductId: string,
  ): Promise<{ action: 'deactivated' | 'not_found'; id?: string }> {
    const existing = await this.prisma.productReference.findUnique({
      where: { shopifyProductId },
    });

    if (!existing || !existing.isActive) {
      return { action: 'not_found' };
    }

    // Soft-delete product and cascade to compat matrix in a single transaction.
    // Note: onDelete:Cascade in schema is a hard-delete cascade, not soft-delete,
    // so we must handle the compat deactivation manually here.
    await this.prisma.$transaction([
      this.prisma.productReference.update({
        where: { id: existing.id },
        data: { isActive: false },
      }),
      this.prisma.styleFormatProductCompat.updateMany({
        where: { productRefId: existing.id },
        data: { isActive: false },
      }),
      this.prisma.productFormatVariant.updateMany({
        where: { productRefId: existing.id },
        data: { isActive: false },
      }),
    ]);

    await this.writeAuditLog('product_sync_deactivated', existing.id);
    this.logger.debug(`Deactivated product ${shopifyProductId} (id: ${existing.id})`);
    return { action: 'deactivated', id: existing.id };
  }

  private stripHtml(html: string): string {
    return html?.replace(/<[^>]*>/g, '').trim() ?? '';
  }

  private async writeAuditLog(action: string, entityId: string): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action,
        entityType: 'ProductReference',
        entityId,
      },
    });
  }
}
