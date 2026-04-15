import { Injectable, Logger } from '@nestjs/common';
import { BaseStyleStrategy } from './pipeline.types';
import { DefaultStyleStrategy } from './strategies/default.strategy';

@Injectable()
export class StrategyRegistry {
  private readonly logger = new Logger(StrategyRegistry.name);
  private readonly map = new Map<string, BaseStyleStrategy>();

  constructor(private defaultStrategy: DefaultStyleStrategy) {
    this.register(defaultStrategy);
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
}
