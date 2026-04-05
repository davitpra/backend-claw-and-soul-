import { Module } from '@nestjs/common';
import { GenerationsModule } from '../generations/generations.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookSecretGuard } from './guards/webhook-secret.guard';

@Module({
  imports: [GenerationsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookSecretGuard],
})
export class WebhooksModule {}
