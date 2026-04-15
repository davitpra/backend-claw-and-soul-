import { Style, Pet, PetPhoto } from '@prisma/client';

export interface PipelineContext {
  generationId: string;
  petPhotoUrl: string;
  style: Style;
  pet: Pet;
  userPrompt?: string;
}

export interface PipelineResult {
  visionAnalysis?: Record<string, any>;
  finalPrompt: string;
  falRequestId: string;
  resultUrl: string;
  resultStorageKey: string;
  processingTimeSeconds: number;
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
  style: Style;
  pet: Pet;
  petPhoto: PetPhoto | null;
}
