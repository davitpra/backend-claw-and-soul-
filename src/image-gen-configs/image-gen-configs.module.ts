import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ImageGenConfigsService } from './image-gen-configs.service';
import { AdminImageGenConfigsController } from './admin-image-gen-configs.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminImageGenConfigsController],
  providers: [ImageGenConfigsService],
  exports: [ImageGenConfigsService],
})
export class ImageGenConfigsModule {}
