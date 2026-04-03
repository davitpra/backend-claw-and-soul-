import { Module } from '@nestjs/common';
import { FormatsService } from './formats.service';
import { FormatsController } from './formats.controller';
import { AdminFormatsController } from './admin-formats.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FormatsController, AdminFormatsController],
  providers: [FormatsService],
  exports: [FormatsService],
})
export class FormatsModule {}
