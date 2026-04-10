import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { AdminProductsController } from './admin-products.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopifySyncModule } from '../shopify-sync/shopify-sync.module';

@Module({
  imports: [PrismaModule, ShopifySyncModule],
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
