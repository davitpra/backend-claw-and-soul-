import { Module } from '@nestjs/common';
import { StylesService } from './styles.service';
import { StylesController } from './styles.controller';
import { AdminStylesController } from './admin-styles.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StylesController, AdminStylesController],
  providers: [StylesService],
  exports: [StylesService],
})
export class StylesModule {}
