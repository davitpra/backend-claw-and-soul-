import {
  Style,
  Pet,
  PetPhoto,
  Format,
  VisionConfig,
  ImageGenConfig,
} from '@prisma/client';

/** Fallback when neither constraints nor the linked Format provide an aspect ratio. */
export const DEFAULT_ASPECT_RATIO = '3:4';

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
  userSelections?: Record<string, string | number>;
  subjectPhotoUrls?: string[];
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
