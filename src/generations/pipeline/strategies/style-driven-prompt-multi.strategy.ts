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

const MAX_SUBJECT_IMAGES = 4;

@Injectable()
export class StyleDrivenPromptMultiStrategy extends BaseStyleStrategy {
  readonly key = 'style-driven-prompt-multi';
  private readonly logger = new Logger(StyleDrivenPromptMultiStrategy.name);

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

    // Si Muck_AI=true, se omiten OpenRouter y Fal.ai, y se devuelve un resultado simulado para facilitar pruebas sin consumir créditos de IA ni hacer uploads a Cloudinary
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

    // Extraemos la configuración de la style para usarla en el pipeline
    const { style } = ctx;
    const { visionConfig, imageGenConfig } = style;

    if (!visionConfig) {
      throw new Error(
        `Style "${style.name}" requires a visionConfig for strategy "style-driven-prompt-multi"`,
      );
    }
    if (!imageGenConfig) {
      throw new Error(
        `Style "${style.name}" requires an imageGenConfig for strategy "style-driven-prompt-multi"`,
      );
    }

    // Usar TODAS las fotos de la mascota (cap de MAX_SUBJECT_IMAGES) tanto para
    // el análisis de visión como para la generación en Fal.ai
    const subjectUrls = (
      ctx.subjectPhotoUrls?.length ? ctx.subjectPhotoUrls : [ctx.petPhotoUrl]
    )
      .filter(Boolean)
      .slice(0, MAX_SUBJECT_IMAGES);

    this.logger.log(
      `[${ctx.generationId}] Using ${subjectUrls.length} subject image(s)`,
    );

    const promptTemplate = style.promptTemplate;
    const templateVars = (style.templateVars ?? null) as Record<
      string,
      unknown
    > | null;
    const visionModel = visionConfig.visionModel ?? null;
    const visionTemperature = visionConfig.visionTemperature ?? null;
    const visionSystemPrompt = visionConfig.systemPrompt ?? null;
    const visionMaxTokens = visionConfig.maxTokens ?? null;
    const falModel = imageGenConfig.model ?? null;
    const falParameters = (imageGenConfig.parameters ?? {}) as Record<
      string,
      unknown
    >;

    const mergedTemplateVars = {
      ...(templateVars ?? {}),
      ...(ctx.userSelections ?? {}),
      maxPets: ctx.constraints.maxPets,
    };

    // Freeze a snapshot of the template config at execution time for audit/reproducibility
    const promptSnapshot = {
      visionConfigId: visionConfig.id,
      imageGenConfigId: imageGenConfig.id,
      promptTemplate,
      templateVars: mergedTemplateVars,
      userSelections: ctx.userSelections ?? null,
      visionModel,
      visionTemperature,
      visionSystemPrompt,
      visionMaxTokens,
      falModel,
      subjectImageCount: subjectUrls.length,
      constraints: ctx.constraints,
    };

    // Step 1 — Vision + prompt generation via OpenRouter VLM (todas las fotos)
    const visionResult = await this.openRouterPrompt.buildPrompt({
      photoUrl: ctx.petPhotoUrl,
      photoUrls: subjectUrls,
      promptTemplate,
      templateVars: mergedTemplateVars,
      petContext: {
        name: ctx.pet.name,
        species: ctx.pet.species,
        breed: ctx.pet.breed,
      },
      visionModel,
      temperature: visionTemperature ?? undefined,
      systemPrompt: visionSystemPrompt,
      maxTokens: visionMaxTokens,
    });

    const prompt = visionResult.prompt;
    this.logger.log(`[${ctx.generationId}] Final prompt: ${prompt}`);

    // aspectRatio from constraints overrides the format's value
    const aspectRatio = ctx.constraints.aspectRatio ?? ctx.format?.aspectRatio;

    // Step 2 — Generate image with Fal.ai (todas las fotos como referencia)
    const falResult = await this.fal.generate({
      model: falModel ?? 'fal-ai/flux/dev',
      prompt,
      imageUrls: subjectUrls,
      aspectRatio,
      params: falParameters,
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
