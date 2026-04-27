# Generations Module

Core engine for AI-powered image generation. All generations are free and unlimited for all users.

## Files Structure

```
generations/
├── generations.controller.ts               # REST API endpoints
├── generations.service.ts                  # Orchestration logic
├── generations.module.ts                   # DI registration (imports CompatModule)
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
│       └── default.strategy.ts            # Default 3-step pipeline
└── providers/
    ├── openrouter/
    │   └── openrouter-prompt.service.ts    # Analyzes pet photo + builds creative prompt via openrouter/router/vision
    └── fal/
        └── fal.service.ts                  # Calls Fal.ai image model and downloads image buffer
```

---

## Image Generation Flow

### 1. HTTP Request

The user calls `POST /api/generations` with `petId`, `styleId`, `formatId`, `productRefId`, and optional `petPhotoId`.

`GenerationsService.createImageGeneration()`:

1. Validates pet ownership.
2. Validates style exists.
3. Calls `CompatService.checkCompat(styleId, formatId, productRefId)` — verifies the triplet exists and is active in `StyleFormatProductCompat`. Throws `400 BadRequest` if not compatible.
4. Creates a `Generation` record with `status: "pending"`, storing `constraints` from the compat row in `metadata.compatConstraints`.
5. Enqueues a job in the BullMQ `image-generation` queue with `{ generationId }`.

### 2. BullMQ Worker

`ImageGenerationProcessor.process()` picks up the job from Redis and runs:

```
findForProcessing(generationId)
  → loads Generation with relations: style, pet, petPhoto, format
updateGenerationStatus("processing")
  → DB: status = "processing"
extract constraints from generation.metadata.compatConstraints
  → merges with system defaults: { maxPets: 1, ...compatConstraints }
StrategyRegistry.get(style.strategyKey)
  → resolves to the correct strategy (default, anime, watercolor, etc.)
strategy.execute(PipelineContext)
  → runs the 3-step pipeline (see below)
markCompleted(generationId, result)
  → DB: status = "completed", resultUrl, finalPrompt, visionAnalysis, falRequestId,
        processingTimeSeconds, promptSnapshot
```

On error: `markFailed(generationId, errorMessage)` → `status = "failed"`. BullMQ rethrows and can retry.

### 3. The Pipeline — DefaultStyleStrategy

Each strategy receives a `PipelineContext`:

```typescript
{
  generationId: string;
  petPhotoUrl: string;          // from PetPhoto.photoUrl
  style: Style;                 // includes all pipeline config fields (see Style DB Fields below)
  pet: Pet;                     // includes name, species, breed
  format: Format | null;        // loaded from generation.formatId relation
  constraints: Record<string, any>; // merged from metadata.compatConstraints + system defaults
}
```

**Known constraint keys**:

| Key           | Default | Description |
| :------------ | :------ | :---------- |
| `maxPets`     | `1`     | Max number of pets to describe in the vision prompt. Applied in prompt template vars. |
| `aspectRatio` | —       | When present, overrides `format.aspectRatio` in the fal payload. |

#### Step 1 — Vision + Prompt Generation (`OpenRouterPromptService`)

Calls `fal.subscribe("openrouter/router/vision", ...)` with the pet photo and instructions.

`templateVars` sent to the prompt builder are the **merge of `style.templateVars` and constraint-derived vars**:

```ts
{
  ...style.templateVars,
  maxPets: ctx.constraints.maxPets,  // always present (default 1)
}
```

The message sent to the VLM is structured as:

```
Escribe únicamente el prompt final en inglés. Sustituye [description] con una descripción
detallada solo del rostro del animal en la imagen (ignora la pose o el cuerpo).
Usa el nombre "{petName}" donde dice [Name].

La descripción debe seguir este estilo: "{style.descriptionExample}"

Prompt base:
{style.promptTemplate con {templateVars} ya sustituidos}
```

- **`style.promptTemplate`** — base prompt con marcadores `[rellenar]` y `[Name]`. El VLM los sustituye con la descripción del rostro y el nombre.
- **`style.descriptionExample`** — ejemplo del estilo de descripción esperado (e.g. `"of a gray short-haired cat with large, round, green expressive eyes"`). Guía el nivel de detalle y vocabulario del VLM.
- **`style.templateVars`** — variables server-side (`{colorCount}`, `{background}`, etc.) sustituidas **antes** de enviar al VLM. Se fusionan con los vars derivados de constraints (`maxPets`).
- **`style.visionModel`** — VLM a usar (default: `google/gemini-2.5-flash` o env `OPENROUTER_DEFAULT_MODEL`).
- **`style.visionTemperature`** — creatividad del VLM (`0.0`–`1.0`, default `0.7`). Valores bajos = más literal, valores altos = más creativo.

Saved to `Generation.finalPrompt`. Raw response `{ output, model, usage }` saved to `Generation.visionAnalysis`.

#### Step 2 — Image Generation (`FalService`)

Resolves `aspectRatio` for the fal payload:

```ts
const aspectRatio = ctx.constraints.aspectRatio ?? ctx.format?.aspectRatio;
```

Calls `fal.subscribe(style.falModel, { input: { prompt, image_urls, aspect_ratio, ...style.parameters } })` and waits synchronously.

- **`image_urls`**: `[ctx.petPhotoUrl]` — the pet photo is always sent as input image (supports image-to-image models like `fal-ai/nano-banana-2/edit`).
- **`aspect_ratio`**: resolved above — compat constraints take priority over the format default.
- **`style.parameters`**: extra params passed directly to the model (steps, guidance, etc.). Spread last so they can override defaults.

Downloads the generated image as a `Buffer`. Saves the request ID to `Generation.falRequestId`.

`FalService.generate()` first-class input fields:

| Field          | Maps to fal key  | Description |
| :------------- | :--------------- | :---------- |
| `imageUrls`    | `image_urls`     | Source images for image-to-image models. |
| `aspectRatio`  | `aspect_ratio`   | Output aspect ratio string (e.g. `"4:5"`, `"16:9"`). |
| `numImages`    | `num_images`     | Number of images to generate (default fal model default). |
| `outputFormat` | `output_format`  | `"jpeg"` or `"png"`. |
| `params`       | spread last      | Freeform extra params — overrides all above if same key. |

#### Step 3 — Upload to Cloudinary (`StorageService`)

Uploads the image buffer via `StorageService.upload(key, buffer, contentType)`.

Returns the Cloudinary public URL. Saved to `Generation.resultUrl`.

### 4. Full Status Lifecycle

```
pending → processing → completed
                    ↘ failed
```

| Status       | When                                        |
| :----------- | :------------------------------------------ |
| `pending`    | Generation record created, job enqueued     |
| `processing` | Worker picked up the job, pipeline started  |
| `completed`  | All 3 steps succeeded, image URL saved      |
| `failed`     | Any step threw an error, errorMessage saved |

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

## Compatibility Matrix & Constraints

Every image generation must reference a valid triplet `(styleId, formatId, productRefId)` that exists in `StyleFormatProductCompat` with `isActive = true`. This is enforced at creation time via `CompatService.checkCompat()`.

The compat row's `constraints` (JSON) are the source of truth for generation-specific rules tied to the triplet. They are:

1. **Snapshotted** into `Generation.metadata.compatConstraints` at creation time (audit/reproducibility).
2. **Loaded by the processor** at processing time from `metadata.compatConstraints` with system defaults applied (`maxPets: 1`).
3. **Passed to the strategy** as `ctx.constraints` — a flat dict ready to use.

To add a new constraint rule: add the key to the compat row's `constraints` JSON in DB and handle it in the strategy. No code change required for new data-driven rules.

---

## Style DB Fields for Pipeline Config

| Field                | Type    | Description                                                                                   |
| :------------------- | :------ | :-------------------------------------------------------------------------------------------- |
| `strategyKey`        | string  | Maps to a registered strategy (default: `"default"`)                                          |
| `falModel`           | string? | Fal.ai image generation model ID (e.g. `"fal-ai/nano-banana-2/edit"`, `"fal-ai/flux/dev"`)   |
| `parameters`         | Json?   | Extra params passed directly to Fal.ai image model (steps, guidance, etc.)                    |
| `promptTemplate`     | string? | Base prompt with `[rellenar]` and `[Name]` markers — the VLM fills them from the photo        |
| `descriptionExample` | string? | Example description style to guide the VLM (e.g. `"of a golden retriever with brown eyes"`)   |
| `templateVars`       | Json?   | Server-side substitutions for `{placeholders}` in `promptTemplate` (e.g. `{ colorCount: 5 }`) |
| `visionModel`        | string? | VLM used to analyze the photo (default: `google/gemini-2.5-flash`)                            |
| `visionTemperature`  | float?  | VLM creativity 0.0–1.0 (default: 0.7). Lower = more literal, higher = more creative           |

### Example Style config — image-to-image edit model

```json
{
  "strategyKey": "default",
  "falModel": "fal-ai/nano-banana-2/edit",
  "promptTemplate": "A modern vector-style digital illustration [rellenar] looking at camera, centered face portrait...",
  "descriptionExample": "of a gray short-haired cat with large, round, green expressive eyes",
  "templateVars": { "colorCount": 5 },
  "visionModel": null,
  "visionTemperature": null,
  "parameters": {}
}
```

The aspect ratio for fal comes from the compat row's `constraints.aspectRatio` (if set) or from the `Format.aspectRatio` field. Set it on the `StyleFormatProductCompat` row that links this style to its format+product.

---

## Generation DB Fields

| Field            | Type    | Description                                                                   |
| :--------------- | :------ | :---------------------------------------------------------------------------- |
| `visionAnalysis` | Json?   | Raw VLM response `{ output, model, usage }` — used for cost auditing          |
| `finalPrompt`    | string? | Creative prompt produced by the VLM and sent to the image model               |
| `falRequestId`   | string? | Fal.ai vision request ID for traceability                                     |
| `promptSnapshot` | Json?   | Frozen copy of the style template config + constraints used — audit/reproducibility |
| `metadata`       | Json?   | `{ width, height, compatConstraints }` — generation params + snapshotted compat constraints |

### `promptSnapshot` structure

```json
{
  "promptTemplate": "...",
  "descriptionExample": "...",
  "templateVars": { "colorCount": 5, "maxPets": 1 },
  "visionModel": null,
  "visionTemperature": null,
  "falModel": "fal-ai/nano-banana-2/edit",
  "constraints": { "aspectRatio": "4:5", "maxPets": 1 }
}
```

---

## Endpoints

All endpoints require JWT authentication.

| Method   | Endpoint                      | Query Params                                  | Description                                            |
| :------- | :---------------------------- | :-------------------------------------------- | :----------------------------------------------------- |
| `POST`   | `/api/generations`            | —                                             | Create an image generation job.                        |
| `GET`    | `/api/generations`            | `?page&limit&status=pending\|...&pet_id=uuid` | List the authenticated user's generations (paginated). |
| `GET`    | `/api/generations/:id`        | —                                             | Get full details of a specific generation.             |
| `GET`    | `/api/generations/:id/status` | —                                             | Lightweight polling — returns `{ status, progress? }`. |
| `PATCH`  | `/api/generations/:id`        | —                                             | Update `isPublic` / `isFavorite` flags.                |
| `DELETE` | `/api/generations/:id`        | —                                             | Hard delete a generation.                              |

## DTOs

### POST `/api/generations` — CreateImageGenerationDto

| Field            | Type   | Required | Description                                                         |
| :--------------- | :----- | :------- | :------------------------------------------------------------------ |
| `petId`          | UUID   | **Yes**  | Pet to generate art for (must belong to user).                      |
| `styleId`        | UUID   | **Yes**  | Style to apply.                                                     |
| `formatId`       | UUID   | **Yes**  | Format for this generation — must form a valid compat triplet.      |
| `productRefId`   | UUID   | **Yes**  | Product reference — must form a valid compat triplet with style+format. |
| `petPhotoId`     | UUID   | No       | Specific pet photo to use as source image.                          |
| `prompt`         | string | No       | Custom prompt — used as fallback if `style.promptTemplate` is null. |
| `negativePrompt` | string | No       | Negative prompt for the image model.                                |
| `provider`       | string | No       | AI provider identifier (informational).                             |
| `width`          | int    | No       | Output width in px stored in metadata (default 1024).               |
| `height`         | int    | No       | Output height in px stored in metadata (default 1024).              |

### PATCH `/api/generations/:id` — UpdateGenerationFlagsDto

| Field        | Type    | Required | Description                           |
| :----------- | :------ | :------- | :------------------------------------ |
| `isPublic`   | boolean | No       | Make the generation publicly visible. |
| `isFavorite` | boolean | No       | Mark the generation as a favorite.    |

## Environment Variables

```bash
FAL_KEY=fal-...
# OPENROUTER_DEFAULT_MODEL=google/gemini-2.5-flash   # Optional — overrides default vision model globally
```
