import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PodSubmitInput } from './pod-provider.interface';

@Injectable()
export class PodService {
  private readonly logger = new Logger(PodService.name);

  constructor(private readonly configService: ConfigService) {}

  async submitOrder(input: PodSubmitInput): Promise<void> {
    const enabled =
      this.configService.get<string>('ORDERS_POD_ENABLED') === 'true';
    if (!enabled) {
      this.logger.debug(
        `POD disabled — skipping submitOrder for item ${input.orderItemId}`,
      );
      return;
    }
    // When a POD provider is integrated, add the implementation here.
    this.logger.warn(
      `POD enabled but no provider configured for item ${input.orderItemId}`,
    );
  }
}
