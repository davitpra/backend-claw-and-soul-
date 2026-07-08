---
name: security-check
description: Checkeo de seguridad paso a paso del backend (NestJS 11 + Prisma 7 + JWT). Usa esta skill cuando el usuario pida un checkeo/revisión/auditoría de seguridad, "security check", "security review", "revisar seguridad" o quiera saber si el backend es seguro. Guía un análisis de código completo (auth, roles, IDOR, validación, webhooks, uploads, fugas de información) y produce un reporte por severidades SIN modificar código.
---

# Security Check — Backend (NestJS + Prisma)

Auditoría de seguridad guiada del backend de Claw & Soul. **Esta skill es de solo lectura: no edites ningún archivo.** El entregable es un reporte de hallazgos con severidades (formato al final).

## Reglas del análisis

1. **Verifica antes de reportar.** Un match de grep no es un hallazgo: lee el código alrededor y confirma que el problema es real y explotable. Reporta solo hallazgos confirmados; si algo queda dudoso, márcalo como "por confirmar" con la razón.
2. **Cada hallazgo necesita**: ubicación exacta (`archivo:línea`), escenario concreto de explotación (qué haría un atacante) y recomendación (sin aplicarla).
3. Ejecuta los 10 pasos en orden. Los pasos que pasen limpios también se listan en el reporte ("checkeos pasados").

## Arquitectura relevante (contexto)

- Guard JWT **global** vía `APP_GUARD` en `src/app.module.ts` → todo endpoint requiere auth salvo `@Public()`.
- Decoradores en `src/common/decorators/` (`@Public`, `@Roles`, `@CurrentUser`); guards en `src/common/guards/`.
- `ValidationPipe` global en `src/main.ts` con `whitelist` + `forbidNonWhitelisted` + `transform`.
- Roles: `user`, `premium`, `admin`. Refresh tokens persistidos en tabla `RefreshToken`.
- Webhooks: Shopify con HMAC (`shopify-hmac.guard.ts`, raw body en `main.ts`) y genérico con header secreto (`webhooks/guards/webhook-secret.guard.ts`).

## Paso 1 — Secretos hardcodeados

- Grep en `src/` de patrones: `apiKey`, `api_key`, `secret`, `password`, `token`, strings largos base64/hex asignados a constantes, `sk-`, `shpat_`, `Bearer `.
- Todo secreto (JWT, Cloudinary, Shopify Admin, FAL, Pictorem, `WEBHOOK_SECRET`) debe leerse de `process.env`/`ConfigService`, nunca literal.
- Verifica que `.env` está en `.gitignore` y no está commiteado (`git ls-files | grep -E '\.env'`).
- **Severidad**: secreto real en código commiteado = CRÍTICO; secreto de ejemplo/placeholder = BAJO.

## Paso 2 — Cobertura de autenticación

- Lista todos los usos de `@Public()` (grep `@Public`). Para cada uno, confirma que es intencionalmente público (register, login, google, refresh, logout, webhooks, health). Cualquier `@Public()` sobre datos o mutaciones de usuario = ALTO/CRÍTICO.
- En `src/auth/`:
  - Secrets y expiraciones de JWT desde env; access corto (~15min), refresh acotado (~7d).
  - Refresh: ¿se valida contra la tabla `RefreshToken`? ¿Se revoca/rota al usarse? ¿Logout revoca? Refresh sin revocación = ALTO.
  - `bcrypt` con cost ≥ 10.
  - Login con Google: el ID-token debe verificarse con `google-auth-library` (`verifyIdToken` con `audience` = `GOOGLE_CLIENT_ID`), no solo decodificarse.
- `jwt.strategy.ts`: ¿valida que el usuario aún existe/está activo, o confía ciegamente en el payload?

## Paso 3 — Autorización y roles

- Todo controller admin (`admin-*.controller.ts` en admin, products, orders, styles, formats, paint-by-numbers, generations, shopify-sync, vision-configs, image-gen-configs, expenses) debe tener `@Roles('admin')` + `RolesGuard` a nivel de clase o en cada handler. Grep de `admin-.*controller` y verifica uno por uno.
- Busca handlers dentro de controllers no-admin que hagan operaciones privilegiadas (cambiar roles, borrar recursos ajenos) sin `@Roles`.
- Endpoint admin sin `@Roles('admin')` = CRÍTICO.

## Paso 4 — IDOR (acceso a recursos ajenos)

En los services de recursos de usuario (`pets`, `generations`, `orders`, `cart`, `gallery`, `paint-by-numbers`):

- Toda query Prisma `findUnique`/`findFirst`/`update`/`delete` por un `id` que viene de params/body debe además filtrar por `userId` del usuario autenticado (`where: { id, userId }`) o verificar ownership antes de operar.
- Grep de `findUnique({ where: { id` y revisa cada caso: ¿quién provee el id? ¿se verifica ownership?
- Acceso/modificación/borrado de recurso ajeno = ALTO (lectura) / CRÍTICO (escritura o datos personales).

## Paso 5 — Validación de inputs

- Cada handler con `@Body()` debe tipar un DTO con decoradores de `class-validator`. Grep de `@Body()` sin tipo, con `any` o con interfaces sin decoradores (el ValidationPipe no valida clases sin decoradores: con `forbidNonWhitelisted` rechazaría todo, pero con tipos no-clase pasa sin validar).
- `@Param`/`@Query` numéricos: ¿usan `ParseIntPipe`/`ParseUUIDPipe` o DTO?
- Grep de `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`: interpolación de strings con datos de usuario = CRÍTICO (SQL injection). Template tags de Prisma (`` $queryRaw`...${x}` ``) parametrizan y son aceptables.
- DTOs con campos que el usuario no debería controlar (`role`, `userId`, `price`, `status`) y que se persisten tal cual = ALTO (mass assignment).

## Paso 6 — Subida y procesamiento de archivos

En `src/storage/` y todo uso de multer/`@UploadedFile`:

- ¿Se valida MIME type real y tamaño máximo (multer `limits`, `fileFilter`) antes de procesar con sharp o subir a Cloudinary?
- ¿Se usa el nombre de archivo del cliente para rutas/public_ids sin sanitizar? (path traversal / sobreescritura) = ALTO.
- ¿Endpoints de upload accesibles sin auth o sin límite de tamaño? = ALTO (abuso de cuota Cloudinary, DoS por imágenes gigantes en sharp).

## Paso 7 — Webhooks

- `src/common/guards/shopify-hmac.guard.ts`: el HMAC debe calcularse sobre el **raw body** (registrado con `express.raw()` en `main.ts` antes de otros parsers) y compararse con `crypto.timingSafeEqual`. Comparación con `===` = MEDIO; HMAC sobre body re-serializado = ALTO (bypass).
- `src/webhooks/guards/webhook-secret.guard.ts`: misma verificación de comparación timing-safe; ¿qué pasa si `WEBHOOK_SECRET` no está definida (guard que deja pasar todo)? = CRÍTICO.
- ¿Los handlers de webhook son idempotentes o un replay duplica efectos (órdenes, syncs)? = MEDIO.

## Paso 8 — Headers, CORS y abuso

- `helmet`: hoy **no está instalado** — repórtalo (MEDIO) salvo que se haya agregado.
- Rate limiting: **no hay** `@nestjs/throttler` ni equivalente — repórtalo como ALTO en `POST /auth/login`, `/auth/register`, `/auth/refresh` (fuerza bruta de credenciales) y MEDIO en endpoints de generación IA (abuso de costos FAL).
- CORS en `src/main.ts`: `origin` debe ser `FRONTEND_URL` exacto (no `*` ni regex laxo) con `credentials: true`. `origin: true`/`*` con credentials = ALTO.

## Paso 9 — Fuga de información

- `src/common/filters/http-exception.filter.ts` y `all-exceptions.filter.ts`: en producción no deben devolver stack traces, mensajes de Prisma (revelan esquema) ni detalles internos.
- `LoggingInterceptor`: ¿loguea bodies completos? Passwords/tokens en logs = ALTO.
- Respuestas de auth: register/login/reset no deben revelar si un email existe (mensajes diferenciados) = BAJO/MEDIO.
- Respuestas de `users`/`auth`: el hash de password nunca debe salir en JSON — verifica `select`/exclusión en services y serialización. Hash expuesto = CRÍTICO.

## Paso 10 — Prisma y modelo de datos

- `prisma/schema.prisma`: revisa `onDelete: Cascade` — ¿un delete de User arrastra Orders/AuditLog que deberían conservarse por trazabilidad contable? = MEDIO.
- Queries que devuelven el modelo completo (`findMany()` sin `select`) en endpoints públicos o de listado: ¿exponen campos internos (secrets de configs, costos, emails de otros usuarios)? 
- `AuditLog`: ¿las acciones admin sensibles se registran? Ausencia = BAJO (mejora).

## Formato del reporte (entregable único)

```markdown
# Reporte de seguridad — Backend — <fecha>

## Resumen
N críticos · N altos · N medios · N bajos

## Hallazgos

### 1. [CRÍTICO] <título corto>
- **Ubicación**: src/xxx/yyy.ts:NN
- **Riesgo**: <escenario concreto de explotación>
- **Recomendación**: <fix sugerido, no aplicado>

### 2. [ALTO] ...

## Checkeos pasados sin hallazgos
- Paso N — <nombre>: <qué se verificó>

## Por confirmar
- <duda + qué haría falta para confirmarla>
```

Ordena los hallazgos de mayor a menor severidad. No apliques ningún fix: si el usuario quiere arreglar algo, que lo pida explícitamente después del reporte.
