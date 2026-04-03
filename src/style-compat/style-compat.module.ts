import { Module } from '@nestjs/common';
import { StyleCompatService } from './style-compat.service';
import { StyleCompatController } from './style-compat.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StyleCompatController],
  providers: [StyleCompatService],
})
export class StyleCompatModule {}
