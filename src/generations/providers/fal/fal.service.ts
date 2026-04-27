import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fal } from '@fal-ai/client';

export interface FalGenerateInput {
  model: string;
  prompt: string;
  imageUrls?: string[];
  aspectRatio?: string;
  numImages?: number;
  outputFormat?: 'jpeg' | 'png';
  params?: Record<string, any>;
}

export interface FalGenerateResult {
  requestId: string;
  imageBuffer: Buffer;
  contentType: string;
}

interface FalImage {
  url: string;
}

interface FalResponse {
  requestId?: string;
  data?: { images?: FalImage[] };
  images?: FalImage[];
}

@Injectable()
export class FalService {
  private readonly logger = new Logger(FalService.name);

  constructor(private configService: ConfigService) {
    fal.config({ credentials: this.configService.get<string>('ai.falKey') });
  }

  async generate(input: FalGenerateInput): Promise<FalGenerateResult> {
    this.logger.log(
      `Generating with ${input.model} | aspectRatio=${input.aspectRatio ?? '-'} | images=${input.imageUrls?.length ?? 0}`,
    );

    const falInput: Record<string, any> = {
      prompt: input.prompt,
      ...(input.imageUrls?.length ? { image_urls: input.imageUrls } : {}),
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      ...(input.numImages ? { num_images: input.numImages } : {}),
      ...(input.outputFormat ? { output_format: input.outputFormat } : {}),
      ...input.params,
    };

    const result = await fal.subscribe(input.model, { input: falInput });

    const falResult = result as FalResponse;
    const requestId = falResult.requestId ?? 'unknown';
    const images: FalImage[] = falResult.data?.images ?? falResult.images ?? [];

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
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';

    return { requestId, imageBuffer, contentType };
  }
}
