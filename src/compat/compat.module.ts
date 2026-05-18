import { Module } from '@nestjs/common';
import { CompatService } from './compat.service';
import { CompatController } from './compat.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompatController],
  providers: [CompatService],
  exports: [CompatService],
})
export class CompatModule {}
