# Generations Module

Core engine for AI-powered image generation. All generations are free and unlimited for all users.

## Files Structure

```
generations/
├── generations.controller.ts               # REST API endpoints
├── generations.service.ts                  # Orchestration logic
├── generations.module.ts                   # DI registration
├── constants/
│   └── queues.constants.ts                 # QUEUE_NAMES, JOB_NAMES
├── dto/
│   ├── create-image-generation.dto.ts
│   └── update-generation-flags.dto.ts
├── processors/
│   └── image-generation.processor.ts       # BullMQ worker — runs the pipeline
├── pipeline/
│   ├── pipeline.types.ts                   # PipelineContext, PipelineResult, BaseStyleStrategy
│   ├── strategy.registry.ts               # Resolves strategyKey → strategy instance
│   └── strategies/
│       └── default.strategy.ts            # Default 4-step pipeline
└── providers/
    ├── vision/
    │   └── openai-vision.service.ts        # Analyzes pet photo with GPT-4o
    ├── prompt/
    │   └── prompt-builder.service.ts       # Replaces {placeholders} in templates
    └── fal/
        └── fal.service.ts                  # Calls Fal.ai and downloads image buffer
```

---

## Image Generation Flow

### 1. HTTP Request

The user calls `POST /api/generations` with a `petId`, `styleId`, and optional `petPhotoId`.

`GenerationsService.createImageGeneration()`:
- Validates pet ownership
- Validates style exists
- Creates a `Generation` record with `status: "pending"`
- Enqueues a job in the BullMQ `image-generation` queue with `{ generationId }`

### 2. BullMQ Worker

`ImageGenerationProcessor.process()` picks up the job from Redis and runs:

```
findForProcessing(generationId)
  → loads Generation with relations: style, pet, petPhoto
updateGenerationStatus("processing")
  → DB: status = "processing"
StrategyRegistry.get(style.strategyKey)
  → resolves to the correct strategy (default, anime, watercolor, etc.)
strategy.execute(PipelineContext)
  → runs the full 4-step pipeline (see below)
markCompleted(generationId, result)
  → DB: status = "completed", resultUrl, finalPrompt, visionAnalysis, falRequestId, processingTimeSeconds
```

On error: `markFailed(generationId, errorMessage)` → `status = "failed"`. BullMQ rethrows and can retry.

### 3. The Pipeline — DefaultStyleStrategy

Each strategy receives a `PipelineContext`:
```typescript
{
  generationId: string;
  petPhotoUrl: string;    // from PetPhoto.photoUrl
  style: Style;           // includes strategyKey, falModel, promptTemplate, visionEnabled, parameters
  pet: Pet;               // includes name, species, breed
  userPrompt?: string;    // prompt from CreateDto, if provided
}
```

#### Step 1 — Vision Analysis (`OpenAIVisionService`)

Calls GPT-4o with the pet photo URL. Disabled if `style.visionEnabled = false`.

Returns:
```json
{
  "species": "dog",
  "breed": "golden retriever",
  "coatColor": "golden",
  "pose": "sitting",
  "expression": "happy",
  "background": "grass field",
  "distinctiveFeatures": "fluffy tail"
}
```

Saved to `Generation.visionAnalysis`.

#### Step 2 — Prompt Building (`PromptBuilderService`)

Takes `style.promptTemplate` from DB and replaces `{placeholders}` with vision data + pet data:

```
Template : "A {coatColor} {breed} named {petName}, watercolor painting, soft pastel tones"
Variables: { coatColor: "golden", breed: "golden retriever", petName: "Max" }
Result   : "A golden golden retriever named Max, watercolor painting, soft pastel tones"
```

Falls back to `userPrompt` if no template is set. Saved to `Generation.finalPrompt`.

#### Step 3 — Image Generation (`FalService`)

Calls `fal.subscribe(style.falModel, { input: { prompt, ...style.parameters } })` and waits for the result synchronously.

Downloads the generated image as a `Buffer`. Saves the request ID to `Generation.falRequestId`.

#### Step 4 — Upload to Cloudinary (`StorageService`)

Uploads the image buffer using the global `StorageService.upload(key, buffer, contentType)`.

Returns the Cloudinary public URL. Saved to `Generation.resultUrl`.

### 4. Full Status Lifecycle

```
pending → processing → completed
                    ↘ failed
```

| Status       | When                                           |
| :----------- | :--------------------------------------------- |
| `pending`    | Generation record created, job enqueued        |
| `processing` | Worker picked up the job, pipeline started     |
| `completed`  | All 4 steps succeeded, image URL saved         |
| `failed`     | Any step threw an error, errorMessage saved    |

Poll status via `GET /api/generations/:id/status`.

---

## Adding a New Style Strategy

1. Create `pipeline/strategies/my-style.strategy.ts` extending `BaseStyleStrategy`:
   ```typescript
   @Injectable()
   export class MyStyleStrategy extends BaseStyleStrategy {
     readonly key = 'my-style';
     async execute(ctx: PipelineContext): Promise<PipelineResult> { ... }
   }
   ```

2. Register it in `GenerationsModule` providers.

3. Inject it into `StrategyRegistry` constructor and call `this.register(myStyleStrategy)`.

4. Set `strategyKey = "my-style"` on the `Style` record in DB.

---

## Style DB Fields for Pipeline Config

| Field            | Type     | Description                                              |
| :--------------- | :------- | :------------------------------------------------------- |
| `strategyKey`    | string   | Maps to a registered strategy (default: `"default"`)     |
| `falModel`       | string?  | Fal.ai model ID (e.g. `"fal-ai/flux/dev"`)               |
| `promptTemplate` | string?  | Template with `{placeholders}` for prompt building       |
| `visionEnabled`  | boolean  | Whether to run GPT-4o vision analysis (default: `true`)  |
| `parameters`     | Json?    | Extra params passed to Fal.ai (size, steps, guidance...) |

---

## Generation DB Fields Added

| Field           | Type   | Description                                    |
| :-------------- | :----- | :--------------------------------------------- |
| `visionAnalysis`| Json?  | Raw output from GPT-4o vision step             |
| `finalPrompt`   | string?| Rendered prompt sent to Fal.ai                 |
| `falRequestId`  | string?| Fal.ai request ID for traceability             |

---

## Endpoints

All endpoints require JWT authentication.

| Method   | Endpoint                      | Query Params                                        | Description                                           |
| :------- | :---------------------------- | :-------------------------------------------------- | :---------------------------------------------------- |
| `POST`   | `/api/generations`            | —                                                   | Create an image generation job.                       |
| `GET`    | `/api/generations`            | `?page&limit&status=pending\|...&pet_id=uuid`       | List the authenticated user's generations (paginated).|
| `GET`    | `/api/generations/:id`        | —                                                   | Get full details of a specific generation.            |
| `GET`    | `/api/generations/:id/status` | —                                                   | Lightweight polling — returns `{ status, progress? }`.|
| `PATCH`  | `/api/generations/:id`        | —                                                   | Update `isPublic` / `isFavorite` flags.               |
| `DELETE` | `/api/generations/:id`        | —                                                   | Hard delete a generation.                             |

## DTOs

### POST `/api/generations` — CreateImageGenerationDto

| Field            | Type   | Required | Description                                     |
| :--------------- | :----- | :------- | :---------------------------------------------- |
| `petId`          | UUID   | Yes      | Pet to generate art for (must belong to user).  |
| `styleId`        | UUID   | Yes      | Style to apply.                                 |
| `petPhotoId`     | UUID   | No       | Specific pet photo to use as source.            |
| `prompt`         | string | No       | Custom prompt. Defaults to `{species} {breed}`. |
| `negativePrompt` | string | No       | Negative prompt for the AI model.               |
| `provider`       | string | No       | AI provider identifier (informational).         |
| `width`          | int    | No       | Output width in px (default 1024).              |
| `height`         | int    | No       | Output height in px (default 1024).             |
| `formatId`       | UUID   | No       | Format reference for compat tracking.           |
| `productRefId`   | UUID   | No       | Product reference for compat tracking.          |

### PATCH `/api/generations/:id` — UpdateGenerationFlagsDto

| Field        | Type    | Required | Description                           |
| :----------- | :------ | :------- | :------------------------------------ |
| `isPublic`   | boolean | No       | Make the generation publicly visible. |
| `isFavorite` | boolean | No       | Mark the generation as a favorite.   |

## Environment Variables Required

```bash
OPENAI_API_KEY=sk-...   # For GPT-4o vision analysis
FAL_KEY=fal-...         # For Fal.ai image generation
```
