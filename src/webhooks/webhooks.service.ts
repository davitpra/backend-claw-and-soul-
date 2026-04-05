import { Injectable, Logger } from '@nestjs/common';
import { GenerationsService } from '../generations/generations.service';
import { GenerationCompleteDto } from './dto/generation-complete.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly generationsService: GenerationsService) {}

  async handleGenerationComplete(dto: GenerationCompleteDto) {
    const { generationId, status, ...fields } = dto;

    this.logger.log(`Webhook received: generation ${generationId} → ${status}`);

    const data: Record<string, any> = {};
    if (fields.resultUrl !== undefined) data.resultUrl = fields.resultUrl;
    if (fields.resultStorageKey !== undefined) data.resultStorageKey = fields.resultStorageKey;
    if (fields.thumbnailUrl !== undefined) data.thumbnailUrl = fields.thumbnailUrl;
    if (fields.errorMessage !== undefined) data.errorMessage = fields.errorMessage;
    if (fields.processingTimeSeconds !== undefined) data.processingTimeSeconds = fields.processingTimeSeconds;
    if (fields.metadata !== undefined) data.metadata = fields.metadata;

    return this.generationsService.updateGenerationStatus(generationId, status, data);
  }
}
