# 🎨 Generations Module

Core engine for AI-powered image and video generation, implementing the flows from sections 2.1, 2.2, and 5 of the project flowchart.

## 📁 Files Structure

- `generations/generations.service.ts`: Logic for orchestrating generations, credit handling, and provider integration.
- `generations/generations.controller.ts`: API endpoints for initiating and monitoring generation jobs.

## 🚀 Endpoints

| Method   | Endpoint                 | Description                                            |
| :------- | :----------------------- | :----------------------------------------------------- |
| `POST`   | `/api/generations/image` | Initiate an image generation job.                      |
| `POST`   | `/api/generations/video` | Initiate a video generation job.                       |
| `GET`    | `/api/generations`       | List the authenticated user's generations (paginated). |
| `GET`    | `/api/generations/:id`   | Retrieve status and details of a specific generation.  |
| `DELETE` | `/api/generations/:id`   | Remove a generation from the user's history.           |

## 🛠️ Features

- **Security & Validation**: Strict pet ownership checks before processing.
- **Credit Integration**:
  - Pre-generation credit availability checks.
  - **Atomic Transactions**: Credit deduction and record creation happen as a single unit.
  - Automatic transaction logging for auditing.
- **Workflow State Management**: Tracking through multiple states: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.
- **Provider Support**: Extensible architecture for OpenAI, Stability AI, and Runway.
- **Customization**: Support for granular parameters and custom prompts.

## ⚠️ Important Notes

> [!IMPORTANT]
> **Queue Integration (TODO)**: Job queue integration (e.g., Bull/Redis) is currently pending. Generations are recorded in the database but are not yet being enqueued for asynchronous processing.
