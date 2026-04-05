import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { WebhookSecretGuard } from './guards/webhook-secret.guard';
import { WebhooksService } from './webhooks.service';
import { GenerationCompleteDto } from './dto/generation-complete.dto';

@ApiTags('webhooks')
@Public()
@UseGuards(WebhookSecretGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('generation-complete')
  @ApiOperation({ summary: 'Callback when a generation job completes or fails' })
  @ApiHeader({ name: 'x-webhook-secret', description: 'Shared webhook secret', required: true })
  @ApiResponse({ status: 200, description: 'Generation status updated' })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  @ApiResponse({ status: 401, description: 'Invalid webhook secret' })
  @ApiResponse({ status: 404, description: 'Generation not found' })
  async generationComplete(@Body() dto: GenerationCompleteDto) {
    return this.webhooksService.handleGenerationComplete(dto);
  }
}
