import { Injectable, Logger } from '@nestjs/common';
import { BaseStyleStrategy, PipelineContext, PipelineResult } from '../pipeline.types';
import { OpenAIVisionService } from '../../providers/vision/openai-vision.service';
import { PromptBuilderService } from '../../providers/prompt/prompt-builder.service';
import { FalService } from '../../providers/fal/fal.service';
import { StorageService } from '../../../storage/storage.service';

@Injectable()
export class DefaultStyleStrategy extends BaseStyleStrategy {
  readonly key = 'default';
  private readonly logger = new Logger(DefaultStyleStrategy.name);

  constructor(
    private vision: OpenAIVisionService,
    private promptBuilder: PromptBuilderService,
    private fal: FalService,
    private storage: StorageService,
  ) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<PipelineResult> {
    const start = Date.now();

    // Step 1 — Vision analysis (optional per style)
    let analysis: Record<string, any> | undefined;
    if (ctx.style.visionEnabled) {
      this.logger.log(`[${ctx.generationId}] Running vision analysis`);
      analysis = await this.vision.analyzePet(ctx.petPhotoUrl);
    }

    // Step 2 — Build prompt from template or fall back to userPrompt
    const template =
      (ctx.style.promptTemplate as string | null) ?? ctx.userPrompt ?? '{breed} {species} portrait, professional photo';

    const prompt = this.promptBuilder.build(template, {
      ...analysis,
      petName: ctx.pet.name,
      breed: ctx.pet.breed ?? 'mixed',
      species: ctx.pet.species,
      userPrompt: ctx.userPrompt ?? '',
    });

    this.logger.log(`[${ctx.generationId}] Final prompt: ${prompt}`);

    // Step 3 — Generate with Fal.ai
    const falResult = await this.fal.generate({
      model: (ctx.style.falModel as string | null) ?? 'fal-ai/flux/dev',
      prompt,
      params: (ctx.style.parameters as Record<string, any>) ?? {},
    });

    // Step 4 — Upload to Cloudinary via StorageService
    const storageKey = `generations/${ctx.generationId}/result`;
    const resultUrl = await this.storage.upload(storageKey, falResult.imageBuffer, falResult.contentType);

    return {
      visionAnalysis: analysis,
      finalPrompt: prompt,
      falRequestId: falResult.requestId,
      resultUrl,
      resultStorageKey: storageKey,
      processingTimeSeconds: Math.round((Date.now() - start) / 1000),
    };
  }
}
