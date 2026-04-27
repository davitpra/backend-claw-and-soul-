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

export interface OpenRouterPromptInput {
  photoUrl: string;
  /** Art direction instruction / base prompt template (with [rellenar] and [Name] placeholders). */
  promptTemplate: string;
  /** Example description style to guide the VLM (e.g. "of a gray short-haired cat with large, round, green eyes"). */
  descriptionExample?: string | null;
  /** Server-side variables substituted into promptTemplate before sending to VLM (e.g. { colorCount: 5 }). */
  templateVars?: Record<string, unknown> | null;
  petContext: { name: string; species: string; breed?: string | null };
  visionModel?: string | null;
  temperature?: number;
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
          image_urls: [input.photoUrl],
          model,
          system_prompt:
            'You are an expert prompt engineer for AI image generation models. ' +
            'Be precise, avoid speculation, and base all descriptions strictly on visible elements in the image. ' +
            'Output ONLY the final prompt text in English — no preamble, no quotes, no markdown, no explanation.',
          prompt: this.composeUserPrompt(input),
          temperature: input.temperature ?? 0.7,
          max_tokens: 400,
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
    const { promptTemplate, descriptionExample, templateVars, petContext } =
      input;

    // Substitute server-side {placeholders} from templateVars
    const resolvedTemplate = this.applyTemplateVars(
      promptTemplate,
      templateVars ?? {},
    );

    const exampleLine = descriptionExample
      ? `La descripción debe seguir este estilo: "${descriptionExample}".`
      : 'Describe el rostro del animal con detalle visual (color de pelo, ojos, rasgos distintivos).';

    return [
      `Escribe únicamente el prompt final en inglés. Sustituye [description] con una descripción detallada solo del rostro del animal en la imagen (ignora completamente la pose o el cuerpo). Usa el nombre "${petContext.name}" donde dice [Name].`,
      '',
      'La descripción debe seguir el siguiente estilo:',
      exampleLine,
      '',
      'Prompt base:',
      resolvedTemplate,
    ].join('\n');
  }

  /** Replaces {key} placeholders using templateVars. Keys without a matching var are left as-is. */
  private applyTemplateVars(
    template: string,
    vars: Record<string, unknown>,
  ): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
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
