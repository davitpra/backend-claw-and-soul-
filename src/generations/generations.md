# Generations Module

Core engine for AI-powered image generation. All generations are free and unlimited for all users.

## Files Structure

- `generations/generations.service.ts`: Orchestration logic — pet/style validation, record creation, and queue dispatch.
- `generations/generations.controller.ts`: API endpoints for creating and querying generation jobs.
- `generations/processors/image-generation.processor.ts`: BullMQ worker that processes image jobs.
- `generations/processors/video-generation.processor.ts`: BullMQ worker that processes video jobs (reserved for future use).
- `generations/constants/queues.constants.ts`: Queue and job name constants.
- `generations/dto/create-image-generation.dto.ts`: DTO for image generation.
- `generations/dto/update-generation-flags.dto.ts`: DTO for updating `isPublic` / `isFavorite` flags.

## Endpoints

All endpoints require JWT authentication.

| Method   | Endpoint                          | Query Params                                  | Description                                      |
| :------- | :-------------------------------- | :-------------------------------------------- | :----------------------------------------------- |
| `POST`   | `/api/generations`                | —                                             | Create an image generation job.                  |
| `GET`    | `/api/generations`                | `?page&limit&status=pending\|...&pet_id=uuid` | List the authenticated user's generations (paginated). |
| `GET`    | `/api/generations/:id`            | —                                             | Get full details of a specific generation.       |
| `GET`    | `/api/generations/:id/status`     | —                                             | Lightweight polling — returns `{ status, progress? }`. |
| `PATCH`  | `/api/generations/:id`            | —                                             | Update `isPublic` / `isFavorite` flags.          |
| `DELETE` | `/api/generations/:id`            | —                                             | Hard delete a generation from the user's history. |

## DTOs

### POST `/api/generations` — CreateImageGenerationDto

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

### PATCH `/api/generations/:id` — UpdateGenerationFlagsDto

| Field        | Type    | Required | Description                        |
| :----------- | :------ | :------- | :--------------------------------- |
| `isPublic`   | boolean | No       | Make the generation publicly visible. |
| `isFavorite` | boolean | No       | Mark the generation as a favorite. |

## Generation Statuses

`pending` → `processing` → `completed` / `failed`

## Features

- **Free & Unlimited**: No credit checks. All users generate without restrictions.
- **Pet Ownership Validation**: Users can only generate art for their own pets.
- **Queue-Based Processing**: Jobs are dispatched to the `image-generation` BullMQ queue immediately after the generation record is created.
- **Pagination**: `GET /api/generations` uses page/limit params (default: page=1, limit=20) and supports filtering by `status` and `pet_id`.
- **Lightweight Polling**: `GET /api/generations/:id/status` returns only `{ status, progress? }` to minimize payload on frequent polls.
- **Flag Updates**: `PATCH /api/generations/:id` allows toggling `isPublic` and `isFavorite` independently.
- **Public Flag**: `findOne` respects `isPublic` — non-owners can only access public generations.
- **Hard Delete**: `DELETE` permanently removes the record from the database.
