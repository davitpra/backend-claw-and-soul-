import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fal } from '@fal-ai/client';

interface OpenRouterVisionOutput {
  output?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
}

const DEFAULT_SYSTEM_PROMPT =
  'You are an expert prompt engineer for AI image generation models. ' +
  'Be precise, avoid speculation, and base all descriptions strictly on visible elements in the image. ' +
  'Output ONLY the final prompt text in English — no preamble, no quotes, no markdown, no explanation.';
const DEFAULT_MAX_TOKENS = 400;

export interface OpenRouterPromptInput {
  photoUrl: string;
  /** Optional extra images. When provided (non-empty), all are sent to the VLM
   *  instead of just `photoUrl`. Falls back to `[photoUrl]` when omitted. */
  photoUrls?: string[];
  /** Full prompt sent to the VLM. Supports {{petName}}, {{petSpecies}}, {{petBreed}},
   *  plus any key from templateVars (e.g. {{maxPets}}, {{colorCount}}). */
  promptTemplate: string;
  /** Runtime + admin-defined variables merged by the caller. */
  templateVars?: Record<string, unknown> | null;
  petContext: { name: string; species: string; breed?: string | null };
  visionModel?: string | null;
  temperature?: number;
  systemPrompt?: string | null;
  maxTokens?: number | null;
}

export interface OpenRouterPromptResult {
  prompt: string;
  visionModel: string;
  visionRequestId: string;
  usage: { prompt_tokens: number; completion_tokens: number; cost: number };
}

@Injectable()
export class OpenRouterPromptService {
  private readonly logger = new Logger(OpenRouterPromptService.name);

  constructor(private configService: ConfigService) {
    fal.config({ credentials: this.configService.get<string>('ai.falKey') });
  }

  async buildPrompt(
    input: OpenRouterPromptInput,
  ): Promise<OpenRouterPromptResult> {
    const model =
      input.visionModel ??
      this.configService.get<string>('ai.openRouterDefaultModel') ??
      'google/gemini-2.5-flash';

    this.logger.log(
      `Calling openrouter/router/vision (model=${model}) for pet "${input.petContext.name}"`,
    );

    this.logger.debug(`[PROMPT PREVIEW]\n${this.composeUserPrompt(input)}`);

    const { data, requestId } = (await fal.subscribe(
      'openrouter/router/vision',
      {
        input: {
          image_urls: input.photoUrls?.length
            ? input.photoUrls
            : [input.photoUrl],
          model,
          system_prompt: input.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
          prompt: this.composeUserPrompt(input),
          temperature: input.temperature ?? 0.7,
          max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        },
      },
    )) as unknown as { data: OpenRouterVisionOutput; requestId: string };

    const output: string = data.output ?? '';

    if (!output) {
      throw new Error(
        `openrouter/router/vision returned empty output (requestId: ${requestId})`,
      );
    }

    return {
      prompt: output.trim(),
      visionModel: model,
      visionRequestId: requestId,
      usage: {
        prompt_tokens: data.usage?.prompt_tokens ?? 0,
        completion_tokens: data.usage?.completion_tokens ?? 0,
        cost: data.usage?.cost ?? 0,
      },
    };
  }

  private composeUserPrompt(input: OpenRouterPromptInput): string {
    const vars: Record<string, unknown> = {
      ...(input.templateVars ?? {}),
      // Runtime context always wins over templateVars on key collision
      petName: input.petContext.name,
      petSpecies: input.petContext.species,
      petBreed: input.petContext.breed ?? '',
    };
    return this.applyTemplateVars(input.promptTemplate, vars);
  }

  /** Replaces {{key}} placeholders. Unknown keys are left as-is. */
  private applyTemplateVars(
    template: string,
    vars: Record<string, unknown>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      const val: unknown = vars[key];
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
