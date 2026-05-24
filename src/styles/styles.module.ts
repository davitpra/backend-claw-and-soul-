import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StylesService } from './styles.service';
import { StylesController } from './styles.controller';
import { AdminStylesController } from './admin-styles.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'image-generation' }),
  ],
  controllers: [StylesController, AdminStylesController],
  providers: [StylesService],
  exports: [StylesService],
})
export class StylesModule {}
