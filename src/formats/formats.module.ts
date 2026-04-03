import { Module } from '@nestjs/common';
import { FormatsService } from './formats.service';
import { FormatsController } from './formats.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FormatsController],
  providers: [FormatsService],
  exports: [FormatsService],
})
export class FormatsModule {}
