import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fal } from '@fal-ai/client';

export interface FalGenerateInput {
  model: string;
  prompt: string;
  params?: Record<string, any>;
}

export interface FalGenerateResult {
  requestId: string;
  imageBuffer: Buffer;
  contentType: string;
}

@Injectable()
export class FalService {
  private readonly logger = new Logger(FalService.name);

  constructor(private configService: ConfigService) {
    fal.config({ credentials: this.configService.get<string>('ai.falKey') });
  }

  async generate(input: FalGenerateInput): Promise<FalGenerateResult> {
    this.logger.log(`Generating image with Fal.ai model: ${input.model}`);

    const result = await fal.subscribe(input.model, {
      input: {
        prompt: input.prompt,
        ...input.params,
      },
    });

    const requestId = (result as any).requestId ?? 'unknown';
    const images: Array<{ url: string }> =
      (result as any).data?.images ?? (result as any).images ?? [];

    if (!images.length) {
      throw new Error(`Fal.ai returned no images for requestId: ${requestId}`);
    }

    const imageUrl = images[0].url;
    this.logger.log(`Fal.ai generation complete. RequestId: ${requestId}`);

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download generated image: ${response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    const contentType =
      response.headers.get('content-type') ?? 'image/jpeg';

    return { requestId, imageBuffer, contentType };
  }
}
