# Generations Module

Core engine for AI-powered image and video generation. All generations are free and unlimited for all users.

## Files Structure

- `generations/generations.service.ts`: Orchestration logic — pet/style validation, record creation, and queue dispatch.
- `generations/generations.controller.ts`: API endpoints for creating and querying generation jobs.
- `generations/processors/image-generation.processor.ts`: BullMQ worker that processes image jobs.
- `generations/processors/video-generation.processor.ts`: BullMQ worker that processes video jobs.
- `generations/constants/queues.constants.ts`: Queue and job name constants.
- `generations/dto/create-image-generation.dto.ts`: DTO for image generation.
- `generations/dto/create-video-generation.dto.ts`: DTO for video generation.

## Endpoints

All endpoints require JWT authentication.

| Method   | Endpoint                   | Query Params                    | Description                                            |
| :------- | :------------------------- | :------------------------------ | :----------------------------------------------------- |
| `POST`   | `/api/generations/image`   | —                               | Create an image generation job.                        |
| `POST`   | `/api/generations/video`   | —                               | Create a video generation job (requires source image). |
| `GET`    | `/api/generations`         | `?page&limit&type=image\|video` | List the authenticated user's generations (paginated). |
| `GET`    | `/api/generations/:id`     | —                               | Get status and details of a specific generation.       |
| `DELETE` | `/api/generations/:id`     | —                               | Hard delete a generation from the user's history.      |

## DTOs

### POST `/api/generations/image` — CreateImageGenerationDto

| Field            | Type    | Required | Description                                        |
| :--------------- | :------ | :------- | :------------------------------------------------- |
| `petId`          | UUID    | Yes      | Pet to generate art for (must belong to user).     |
| `styleId`        | UUID    | Yes      | Style to apply.                                    |
| `petPhotoId`     | UUID    | No       | Specific pet photo to use as source.               |
| `prompt`         | string  | No       | Custom prompt. Defaults to `{species} {breed}`.    |
| `negativePrompt` | string  | No       | Negative prompt for the AI model.                  |
| `provider`       | string  | No       | AI provider: `openai` (default) or `stability`.    |
| `width`          | int     | No       | Output width in px (512–2048, default 1024).       |
| `height`         | int     | No       | Output height in px (512–2048, default 1024).      |
| `formatId`       | UUID    | No       | Format reference for compat tracking.              |
| `productRefId`   | UUID    | No       | Product reference for compat tracking.             |

### POST `/api/generations/video` — CreateVideoGenerationDto

| Field               | Type    | Required | Description                                           |
| :------------------ | :------ | :------- | :---------------------------------------------------- |
| `sourceGenerationId`| UUID    | Yes      | ID of a **completed image** generation to animate.    |
| `duration`          | int     | No       | Video duration in seconds (3–10, default 3).          |
| `motion`            | string  | No       | Motion intensity: `low`, `medium` (default), `high`.  |
| `provider`          | string  | No       | AI provider (default `runway`).                       |

## Generation Statuses

`pending` → `processing` → `completed` / `failed`

## Features

- **Free & Unlimited**: No credit checks. All users generate without restrictions.
- **Pet Ownership Validation**: Users can only generate art for their own pets.
- **Queue-Based Processing**: Jobs are dispatched to BullMQ queues (`image-generation`, `video-generation`) immediately after the generation record is created.
- **Video from Image**: Video generation requires a `sourceGenerationId` pointing to a completed image generation. Inherits pet, style, and prompt from the source.
- **Pagination**: `GET /api/generations` uses page/limit params (default: page=1, limit=20) and supports filtering by `type`.
- **Public Flag**: `findOne` respects `isPublic` on generation — non-owners can only access public generations.
- **Hard Delete**: `DELETE` permanently removes the record from the database.
