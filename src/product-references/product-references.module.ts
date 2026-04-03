import { Module } from '@nestjs/common';
import { ProductReferencesService } from './product-references.service';
import { ProductReferencesController } from './product-references.controller';
import { AdminProductReferencesController } from './admin-product-references.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProductReferencesController, AdminProductReferencesController],
  providers: [ProductReferencesService],
  exports: [ProductReferencesService],
})
export class ProductReferencesModule {}
