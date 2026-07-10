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
import { CreditsModule } from '../credits/credits.module';

// Pipeline
import { StrategyRegistry } from './pipeline/strategy.registry';
import { StyleDrivenPromptStrategy } from './pipeline/strategies/style-driven-prompt.strategy';
import { StyleDrivenPromptMultiStrategy } from './pipeline/strategies/style-driven-prompt-multi.strategy';
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
    CreditsModule,
  ],
  controllers: [GenerationsController, AdminGenerationsController],
  providers: [
    GenerationsService,
    ImageGenerationProcessor,
    // Pipeline
    StrategyRegistry,
    StyleDrivenPromptStrategy,
    StyleDrivenPromptMultiStrategy,
    StyleTransferRolesStrategy,
    StyleTransferRolesMultiStrategy,
    // Providers
    OpenRouterPromptService,
    FalService,
  ],
  exports: [GenerationsService, FalService],
})
export class GenerationsModule {}
