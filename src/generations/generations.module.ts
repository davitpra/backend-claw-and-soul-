import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GenerationsService } from './generations.service';
import { GenerationsController } from './generations.controller';
import { AdminGenerationsController } from './admin-generations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PetsModule } from '../pets/pets.module';
import { StylesModule } from '../styles/styles.module';
import { ImageGenerationProcessor } from './processors/image-generation.processor';
import { QUEUE_NAMES } from './constants/queues.constants';
import { ExpensesModule } from '../expenses/expenses.module';

// Pipeline
import { StrategyRegistry } from './pipeline/strategy.registry';
import { DefaultStyleStrategy } from './pipeline/strategies/default.strategy';
import { StyleTransferRolesStrategy } from './pipeline/strategies/style-transfer-roles.strategy';
import { StyleTransferRolesMultiStrategy } from './pipeline/strategies/style-transfer-roles-multi.strategy';

// Providers
import { OpenRouterPromptService } from './providers/openrouter/openrouter-prompt.service';
import { FalService } from './providers/fal/fal.service';

@Module({
  imports: [
    PrismaModule,
    PetsModule,
    StylesModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.IMAGE_GENERATION }),
    ExpensesModule,
  ],
  controllers: [GenerationsController, AdminGenerationsController],
  providers: [
    GenerationsService,
    ImageGenerationProcessor,
    // Pipeline
    StrategyRegistry,
    DefaultStyleStrategy,
    StyleTransferRolesStrategy,
    StyleTransferRolesMultiStrategy,
    // Providers
    OpenRouterPromptService,
    FalService,
  ],
  exports: [GenerationsService, FalService],
})
export class GenerationsModule {}
