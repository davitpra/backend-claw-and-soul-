import { Injectable, Logger } from '@nestjs/common';
import { BaseStyleStrategy } from './pipeline.types';
import { DefaultStyleStrategy } from './strategies/default.strategy';
import { StyleTransferRolesStrategy } from './strategies/style-transfer-roles.strategy';

@Injectable()
export class StrategyRegistry {
  private readonly logger = new Logger(StrategyRegistry.name);
  private readonly map = new Map<string, BaseStyleStrategy>();

  constructor(
    private defaultStrategy: DefaultStyleStrategy,
    private styleTransferRolesStrategy: StyleTransferRolesStrategy,
  ) {
    this.register(defaultStrategy);
    this.register(styleTransferRolesStrategy);
  }

  register(strategy: BaseStyleStrategy): void {
    this.map.set(strategy.key, strategy);
    this.logger.log(`Registered strategy: ${strategy.key}`);
  }

  get(key: string): BaseStyleStrategy {
    const strategy = this.map.get(key);
    if (!strategy) {
      this.logger.warn(`Unknown strategy "${key}", falling back to "default"`);
      return this.map.get('default')!;
    }
    return strategy;
  }

  listKeys(): string[] {
    return Array.from(this.map.keys());
  }
}
