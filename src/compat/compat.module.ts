import { Module } from '@nestjs/common';
import { CompatService } from './compat.service';
import { CompatController } from './compat.controller';
import { AdminCompatController } from './admin-compat.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompatController, AdminCompatController],
  providers: [CompatService],
  exports: [CompatService],
})
export class CompatModule {}
