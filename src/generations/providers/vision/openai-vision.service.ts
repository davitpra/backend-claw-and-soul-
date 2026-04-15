import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface VisionAnalysis {
  species: string;
  breed: string;
  coatColor: string;
  pose: string;
  expression: string;
  background: string;
  distinctiveFeatures: string;
}

@Injectable()
export class OpenAIVisionService {
  private readonly logger = new Logger(OpenAIVisionService.name);
  private readonly client: OpenAI;

  constructor(private configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.get<string>('ai.openaiKey'),
    });
  }

  async analyzePet(photoUrl: string): Promise<VisionAnalysis> {
    this.logger.log(`Analyzing pet photo: ${photoUrl}`);

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: photoUrl, detail: 'low' },
            },
            {
              type: 'text',
              text: `Analyze this pet photo and respond ONLY with a valid JSON object (no markdown, no explanation) with these exact keys:
{
  "species": "dog|cat|bird|rabbit|other",
  "breed": "breed name or 'mixed' if unknown",
  "coatColor": "main coat color(s) description",
  "pose": "sitting|standing|lying|playing|other description",
  "expression": "happy|calm|curious|playful|sleepy|other",
  "background": "brief background description",
  "distinctiveFeatures": "any distinctive markings or features"
}`,
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '{}';

    try {
      return JSON.parse(content) as VisionAnalysis;
    } catch {
      this.logger.warn(`Failed to parse vision response, using fallback. Raw: ${content}`);
      return {
        species: 'unknown',
        breed: 'unknown',
        coatColor: 'unknown',
        pose: 'unknown',
        expression: 'calm',
        background: 'plain background',
        distinctiveFeatures: 'none',
      };
    }
  }
}
