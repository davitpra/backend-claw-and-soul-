import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GenerationsService } from './generations.service';
import { GenerationsController } from './generations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PetsModule } from '../pets/pets.module';
import { StylesModule } from '../styles/styles.module';
import { ImageGenerationProcessor } from './processors/image-generation.processor';
import { VideoGenerationProcessor } from './processors/video-generation.processor';
import { QUEUE_NAMES } from './constants/queues.constants';

@Module({
  imports: [
    PrismaModule,
    PetsModule,
    StylesModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.IMAGE_GENERATION },
      { name: QUEUE_NAMES.VIDEO_GENERATION },
    ),
  ],
  controllers: [GenerationsController],
  providers: [GenerationsService, ImageGenerationProcessor, VideoGenerationProcessor],
  exports: [GenerationsService],
})
export class GenerationsModule {}
