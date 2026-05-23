import {
  Style,
  Pet,
  PetPhoto,
  Format,
  VisionConfig,
  ImageGenConfig,
} from '@prisma/client';

export type StyleWithConfigs = Style & {
  visionConfig: VisionConfig | null;
  imageGenConfig: ImageGenConfig | null;
};

export interface PipelineContext {
  generationId: string;
  petPhotoUrl: string;
  style: StyleWithConfigs;
  pet: Pet;
  format: Format | null;
  constraints: {
    maxPets?: number;
    aspectRatio?: string;
    [key: string]: unknown;
  };
}

export interface PipelineResult {
  visionAnalysis?: Record<string, any>;
  finalPrompt: string;
  falRequestId: string;
  resultUrl: string;
  resultStorageKey: string;
  processingTimeSeconds: number;
  /** Frozen snapshot of the style template config used — for audit/reproducibility. */
  promptSnapshot?: Record<string, any>;
}

export abstract class BaseStyleStrategy {
  abstract readonly key: string;
  abstract execute(ctx: PipelineContext): Promise<PipelineResult>;
}

export interface GenerationWithRelations {
  id: string;
  userId: string;
  petId: string;
  petPhotoId: string | null;
  styleId: string;
  prompt: string;
  provider: string;
  metadata: any;
  style: StyleWithConfigs;
  pet: Pet;
  petPhoto: PetPhoto | null;
}
