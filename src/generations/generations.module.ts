import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GenerationsService } from './generations.service';
import { GenerationsController } from './generations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PetsModule } from '../pets/pets.module';
import { StylesModule } from '../styles/styles.module';
import { CompatModule } from '../compat/compat.module';
import { ImageGenerationProcessor } from './processors/image-generation.processor';
import { QUEUE_NAMES } from './constants/queues.constants';

// Pipeline
import { StrategyRegistry } from './pipeline/strategy.registry';
import { DefaultStyleStrategy } from './pipeline/strategies/default.strategy';

// Providers
import { OpenRouterPromptService } from './providers/openrouter/openrouter-prompt.service';
import { FalService } from './providers/fal/fal.service';

@Module({
  imports: [
    PrismaModule,
    PetsModule,
    StylesModule,
    CompatModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.IMAGE_GENERATION }),
  ],
  controllers: [GenerationsController],
  providers: [
    GenerationsService,
    ImageGenerationProcessor,
    // Pipeline
    StrategyRegistry,
    DefaultStyleStrategy,
    // Providers
    OpenRouterPromptService,
    FalService,
  ],
  exports: [GenerationsService],
})
export class GenerationsModule {}
