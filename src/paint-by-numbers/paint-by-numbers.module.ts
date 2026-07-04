import { Module } from '@nestjs/common';
import { PaintByNumbersService } from './paint-by-numbers.service';
import { PaintByNumbersController } from './paint-by-numbers.controller';
import { AdminPaintByNumbersController } from './admin-paint-by-numbers.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaintByNumbersController, AdminPaintByNumbersController],
  providers: [PaintByNumbersService],
  exports: [PaintByNumbersService],
})
export class PaintByNumbersModule {}
