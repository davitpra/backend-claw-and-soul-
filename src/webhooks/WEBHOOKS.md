# Webhooks Module

Módulo para recibir callbacks HTTP de proveedores externos de IA (Replicate, RunwayML, Stability AI) cuando terminan de procesar una generación de forma asíncrona.

## Endpoint

```
POST /api/webhooks/generation-complete
```

### Headers requeridos

| Header | Descripción |
|---|---|
| `x-webhook-secret` | Secret compartido definido en `WEBHOOK_SECRET` (env var) |
| `Content-Type` | `application/json` |

### Body

```json
{
  "generationId": "uuid-de-la-generacion",
  "status": "completed",
  "resultUrl": "https://res.cloudinary.com/...",
  "resultStorageKey": "generations/uuid.png",
  "thumbnailUrl": "https://res.cloudinary.com/.../thumbnail.png",
  "processingTimeSeconds": 12,
  "metadata": { "width": 1024, "height": 1024 }
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `generationId` | UUID | ✅ | ID de la generación en la base de datos |
| `status` | `completed` \| `failed` | ✅ | Estado final del trabajo |
| `resultUrl` | string | ❌ | URL pública del resultado generado |
| `resultStorageKey` | string | ❌ | Clave de almacenamiento (Cloudinary) |
| `thumbnailUrl` | string | ❌ | URL del thumbnail |
| `errorMessage` | string | ❌ | Mensaje de error (cuando `status: failed`) |
| `processingTimeSeconds` | integer | ❌ | Tiempo de procesamiento en segundos |
| `metadata` | object | ❌ | Datos adicionales del resultado |

### Respuestas

| Código | Causa |
|---|---|
| `200` | Estado actualizado correctamente |
| `400` | Payload inválido (falla validación del DTO) |
| `401` | Header `x-webhook-secret` ausente o incorrecto |
| `404` | `generationId` no existe en la base de datos |
| `500` | `WEBHOOK_SECRET` no está configurado en el servidor |

---

## Arquitectura

### Seguridad

El endpoint usa `@Public()` para saltar el guard JWT global (los proveedores externos no tienen tokens de usuario). En su lugar, aplica `WebhookSecretGuard` que valida el header `x-webhook-secret` contra la variable de entorno `WEBHOOK_SECRET`.

```
Request →  JwtAuthGuard (skip, @Public)
        →  WebhookSecretGuard (valida x-webhook-secret)
        →  WebhooksController
        →  WebhooksService
        →  GenerationsService.updateGenerationStatus()
        →  Prisma → PostgreSQL
```

### Flujo asíncrono con proveedor externo

```
1. BullMQ processor llama API del proveedor de IA con una URL de callback
2. Proveedor procesa la imagen/video (puede tardar segundos o minutos)
3. Proveedor hace POST /api/webhooks/generation-complete con el resultado
4. WebhooksService actualiza el estado en la base de datos
5. Frontend detecta el cambio via polling o SSE
```

> **Nota:** Los processors BullMQ actuales (`ImageGenerationProcessor`, `VideoGenerationProcessor`) llaman `generationsService.updateGenerationStatus()` **directamente** para el flujo síncrono. No deben llamar este endpoint HTTP ya que están en el mismo proceso NestJS.

### Estructura de archivos

```
src/webhooks/
├── dto/
│   └── generation-complete.dto.ts   # Validación del payload con class-validator
├── guards/
│   └── webhook-secret.guard.ts      # Validación del header x-webhook-secret
├── webhooks.controller.ts           # @Public() + @UseGuards(WebhookSecretGuard)
├── webhooks.service.ts              # Delega a GenerationsService
├── webhooks.module.ts               # Importa GenerationsModule
└── WEBHOOKS.md                      # Este archivo
```

---

## Configuración

Agregar en `.env.local`:

```bash
WEBHOOK_SECRET="tu-secret-aleatorio-aqui"
```

Generar un secret seguro:

```bash
openssl rand -hex 32
```

---

## Ejemplos de uso

### Callback exitoso

```bash
curl -X POST http://localhost:3001/api/webhooks/generation-complete \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: tu-secret" \
  -d '{
    "generationId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "resultUrl": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    "resultStorageKey": "generations/550e8400.jpg",
    "processingTimeSeconds": 8
  }'
```

### Callback de error

```bash
curl -X POST http://localhost:3001/api/webhooks/generation-complete \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: tu-secret" \
  -d '{
    "generationId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "failed",
    "errorMessage": "Content policy violation"
  }'
```

### Sin secret → 401

```bash
curl -X POST http://localhost:3001/api/webhooks/generation-complete \
  -H "Content-Type: application/json" \
  -d '{"generationId": "...", "status": "completed"}'
# → { "statusCode": 401, "message": "Invalid webhook secret" }
```
