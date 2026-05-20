import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BaseStyleStrategy,
  PipelineContext,
  PipelineResult,
} from '../pipeline.types';
import { OpenRouterPromptService } from '../../providers/openrouter/openrouter-prompt.service';
import { FalService } from '../../providers/fal/fal.service';
import { StorageService } from '../../../storage/storage.service';

@Injectable()
export class DefaultStyleStrategy extends BaseStyleStrategy {
  readonly key = 'default';
  private readonly logger = new Logger(DefaultStyleStrategy.name);

  constructor(
    private openRouterPrompt: OpenRouterPromptService,
    private fal: FalService,
    private storage: StorageService,
    private configService: ConfigService,
  ) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<PipelineResult> {
    const start = Date.now();

    if (this.configService.get<boolean>('ai.mock')) {
      this.logger.warn(
        `[${ctx.generationId}] MOCK_AI=true — bypassing OpenRouter + Fal.ai, returning stub result`,
      );
      await new Promise((r) => setTimeout(r, 500));
      return {
        finalPrompt: '[mock] prompt skipped',
        falRequestId: 'mock',
        resultUrl: ctx.petPhotoUrl,
        resultStorageKey: `generations/${ctx.generationId}/result-mock`,
        processingTimeSeconds: Math.round((Date.now() - start) / 1000),
        promptSnapshot: { mock: true },
      };
    }

    const { style } = ctx;
    const promptTemplate = style.promptTemplate ?? null;
    const descriptionExample = style.descriptionExample ?? null;
    const templateVars = (style.templateVars ?? null) as Record<
      string,
      unknown
    > | null;
    const visionModel = style.visionModel ?? null;
    const visionTemperature = style.visionTemperature ?? null;
    const falModel = style.falModel ?? null;

    const mergedTemplateVars = {
      ...(templateVars ?? {}),
      maxPets: ctx.constraints.maxPets,
    };

    // Freeze a snapshot of the template config at execution time for audit/reproducibility
    const promptSnapshot = {
      promptTemplate,
      descriptionExample,
      templateVars: mergedTemplateVars,
      visionModel,
      visionTemperature,
      falModel,
      constraints: ctx.constraints,
    };

    // Step 1 — Vision + prompt generation via OpenRouter VLM
    const visionResult = await this.openRouterPrompt.buildPrompt({
      photoUrl: ctx.petPhotoUrl,
      promptTemplate: promptTemplate ?? '',
      descriptionExample,
      templateVars: mergedTemplateVars,
      petContext: {
        name: ctx.pet.name,
        species: ctx.pet.species,
        breed: ctx.pet.breed,
      },
      visionModel,
      temperature: visionTemperature ?? undefined,
    });

    const prompt = visionResult.prompt;
    this.logger.log(`[${ctx.generationId}] Final prompt: ${prompt}`);

    // aspectRatio from constraints overrides the format's value
    const aspectRatio = ctx.constraints.aspectRatio ?? ctx.format?.aspectRatio;

    // Step 2 — Generate image with Fal.ai
    const falResult = await this.fal.generate({
      model: falModel ?? 'fal-ai/flux/dev',
      prompt,
      imageUrls: [ctx.petPhotoUrl],
      aspectRatio,
      params: (style.parameters as Record<string, unknown>) ?? {},
    });

    // Step 3 — Upload to Cloudinary via StorageService
    const storageKey = `generations/${ctx.generationId}/result`;
    const resultUrl = await this.storage.upload(
      storageKey,
      falResult.imageBuffer,
      falResult.contentType,
    );

    return {
      visionAnalysis: {
        output: visionResult.prompt,
        model: visionResult.visionModel,
        usage: visionResult.usage,
      },
      finalPrompt: prompt,
      falRequestId: visionResult.visionRequestId,
      resultUrl,
      resultStorageKey: storageKey,
      processingTimeSeconds: Math.round((Date.now() - start) / 1000),
      promptSnapshot,
    };
  }
}
