import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VisionConfigsService } from './vision-configs.service';
import { AdminVisionConfigsController } from './admin-vision-configs.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminVisionConfigsController],
  providers: [VisionConfigsService],
  exports: [VisionConfigsService],
})
export class VisionConfigsModule {}
