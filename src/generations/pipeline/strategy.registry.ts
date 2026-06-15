import { Injectable, Logger } from '@nestjs/common';
import { BaseStyleStrategy } from './pipeline.types';
import { StyleDrivenPromptStrategy } from './strategies/style-driven-prompt.strategy';
import { StyleDrivenPromptMultiStrategy } from './strategies/style-driven-prompt-multi.strategy';
import { StyleTransferRolesStrategy } from './strategies/style-transfer-roles.strategy';
import { StyleTransferRolesMultiStrategy } from './strategies/style-transfer-roles-multi.strategy';

@Injectable()
export class StrategyRegistry {
  private readonly logger = new Logger(StrategyRegistry.name);
  private readonly map = new Map<string, BaseStyleStrategy>();

  constructor(
    private styleDrivenPromptStrategy: StyleDrivenPromptStrategy,
    private styleDrivenPromptMultiStrategy: StyleDrivenPromptMultiStrategy,
    private styleTransferRolesStrategy: StyleTransferRolesStrategy,
    private styleTransferRolesMultiStrategy: StyleTransferRolesMultiStrategy,
  ) {
    this.register(styleDrivenPromptStrategy);
    this.register(styleDrivenPromptMultiStrategy);
    this.register(styleTransferRolesStrategy);
    this.register(styleTransferRolesMultiStrategy);
  }

  register(strategy: BaseStyleStrategy): void {
    this.map.set(strategy.key, strategy);
    this.logger.log(`Registered strategy: ${strategy.key}`);
  }

  get(key: string): BaseStyleStrategy {
    const strategy = this.map.get(key);
    if (!strategy) {
      this.logger.warn(
        `Unknown strategy "${key}", falling back to "style-driven-prompt"`,
      );
      return this.map.get('style-driven-prompt')!;
    }
    return strategy;
  }

  listKeys(): string[] {
    return Array.from(this.map.keys());
  }
}
