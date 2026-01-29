import { Module } from '@nestjs/common';
import { GenerationsService } from './generations.service';
import { GenerationsController } from './generations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PetsModule } from '../pets/pets.module';
import { StylesModule } from '../styles/styles.module';

@Module({
  imports: [PrismaModule, PetsModule, StylesModule],
  controllers: [GenerationsController],
  providers: [GenerationsService],
  exports: [GenerationsService],
})
export class GenerationsModule {}
