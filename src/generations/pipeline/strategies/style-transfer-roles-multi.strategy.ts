import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BaseStyleStrategy,
  DEFAULT_ASPECT_RATIO,
  PipelineContext,
  PipelineResult,
} from '../pipeline.types';
import { FalService } from '../../providers/fal/fal.service';
import { StorageService } from '../../../storage/storage.service';

const MAX_SUBJECT_IMAGES = 4;

@Injectable()
export class StyleTransferRolesMultiStrategy extends BaseStyleStrategy {
  readonly key = 'style-transfer-roles-multi';
  private readonly logger = new Logger(StyleTransferRolesMultiStrategy.name);

  constructor(
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
        `[${ctx.generationId}] MOCK_AI=true — bypassing Fal.ai, returning stub result`,
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
    const { imageGenConfig } = style;

    if (!imageGenConfig) {
      throw new Error(
        `Style "${style.name}" requires an imageGenConfig for strategy "style-transfer-roles-multi"`,
      );
    }

    if (!style.styleReferenceUrl) {
      throw new Error(
        `Style "${style.name}" requires styleReferenceUrl set for strategy "style-transfer-roles-multi"`,
      );
    }

    const styleReferenceUrl = style.styleReferenceUrl;

    const subjectUrls = (
      ctx.subjectPhotoUrls?.length ? ctx.subjectPhotoUrls : [ctx.petPhotoUrl]
    )
      .filter(Boolean)
      .slice(0, MAX_SUBJECT_IMAGES);

    this.logger.log(
      `[${ctx.generationId}] Using ${subjectUrls.length} subject image(s)`,
    );

    const falModel = imageGenConfig.model ?? 'fal-ai/flux/dev';
    const falParameters = (imageGenConfig.parameters ?? {}) as Record<
      string,
      unknown
    >;

    const templateVars = (style.templateVars ?? null) as Record<
      string,
      unknown
    > | null;

    const mergedVars: Record<string, unknown> = {
      ...(templateVars ?? {}),
      ...(ctx.userSelections ?? {}),
      maxPets: ctx.constraints.maxPets,
      petName: ctx.pet.name,
      petSpecies: ctx.pet.species,
      petBreed: ctx.pet.breed ?? '',
    };

    const prompt = this.applyTemplateVars(style.promptTemplate, mergedVars);
    this.logger.log(`[${ctx.generationId}] Final prompt: ${prompt}`);

    const promptSnapshot = {
      imageGenConfigId: imageGenConfig.id,
      promptTemplate: style.promptTemplate,
      templateVars: mergedVars,
      userSelections: ctx.userSelections ?? null,
      falModel,
      styleReferenceUrl,
      subjectImageCount: subjectUrls.length,
      constraints: ctx.constraints,
    };

    const aspectRatio =
      ctx.constraints.aspectRatio ??
      ctx.format?.aspectRatio ??
      DEFAULT_ASPECT_RATIO;

    // Image 1 = style/pose reference, Images 2..N = subject identity
    const falResult = await this.fal.generate({
      model: falModel,
      prompt,
      imageUrls: [styleReferenceUrl, ...subjectUrls],
      aspectRatio,
      params: falParameters as Record<string, any>,
    });

    const storageKey = `generations/${ctx.generationId}/result`;
    const resultUrl = await this.storage.upload(
      storageKey,
      falResult.imageBuffer,
      falResult.contentType,
    );

    return {
      finalPrompt: prompt,
      falRequestId: falResult.requestId,
      resultUrl,
      resultStorageKey: storageKey,
      processingTimeSeconds: Math.round((Date.now() - start) / 1000),
      promptSnapshot,
    };
  }

  private applyTemplateVars(
    template: string,
    vars: Record<string, unknown>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      const val = vars[key];
      if (
        typeof val === 'string' ||
        typeof val === 'number' ||
        typeof val === 'boolean'
      )
        return String(val);
      return match;
    });
  }
}
