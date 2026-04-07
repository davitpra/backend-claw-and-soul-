# ClawAndSoul — Backend API

API REST para la plataforma de generación IA de arte de mascotas. Los usuarios suben fotos de sus mascotas y generan imágenes y videos estilizados de forma ilimitada y gratuita.

**Stack:** NestJS · TypeScript · PostgreSQL · Prisma ORM · BullMQ · Redis · Cloudinary · Swagger

---

## Requisitos Previos

| Herramienta | Versión mínima |
|---|---|
| Node.js | 20.x |
| npm | 10.x |
| PostgreSQL | 14.x |
| Redis | 6.2.x |
| Cuenta Cloudinary | — |

---

## Instalación

```bash
npm install
```

Copia las variables de entorno:

```bash
cp .env.example .env.local
```

Configura la base de datos:

```bash
npx prisma generate
npx prisma migrate dev
```

---

## Variables de Entorno

Crea `.env.local` con las siguientes variables (toma prioridad sobre `.env`):

### Base de datos

| Variable | Descripción | Requerida |
|---|---|---|
| `DATABASE_URL` | URL de conexión PostgreSQL | Si |

```
DATABASE_URL="postgresql://user:password@localhost:5432/clawandsoul_dev"
```

### JWT / Autenticación

| Variable | Descripción | Default |
|---|---|---|
| `JWT_ACCESS_SECRET` | Secreto para access tokens | **Requerido** |
| `JWT_REFRESH_SECRET` | Secreto para refresh tokens | **Requerido** |
| `JWT_ACCESS_EXPIRES_IN` | Expiración del access token | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Expiración del refresh token | `7d` |

### Redis (BullMQ)

| Variable | Descripción | Default |
|---|---|---|
| `REDIS_HOST` | Host de Redis | `localhost` |
| `REDIS_PORT` | Puerto de Redis | `6379` |
| `REDIS_PASSWORD` | Contraseña de Redis | — |
| `REDIS_DB` | Número de base de datos | `0` |

### Cloudinary (almacenamiento de imágenes)

| Variable | Descripción |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Nombre de la cuenta |
| `CLOUDINARY_API_KEY` | API key |
| `CLOUDINARY_API_SECRET` | API secret |

### Shopify

| Variable | Descripción |
|---|---|
| `SHOPIFY_ADMIN_API_URL` | URL del Admin API de Shopify |
| `SHOPIFY_ADMIN_API_TOKEN` | Token de autenticación del Admin API |
| `SHOPIFY_WEBHOOK_SECRET` | Secreto para verificar webhooks de Shopify |
| `APP_PUBLIC_URL` | URL pública de la API (ej: `https://api.clawandsoul.com`) |

### Aplicación

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servidor | `3001` |
| `NODE_ENV` | Entorno (`development` / `production`) | `development` |
| `FRONTEND_URL` | URL del frontend para CORS | `http://localhost:3000` |
| `WEBHOOK_SECRET` | Secreto compartido para webhooks de generación | — |

---

## Comandos

### Desarrollo

| Comando | Descripción |
|---|---|
| `npm run start:dev` | Servidor con hot-reload |
| `npm run start:debug` | Servidor con debugger |
| `npm run start:prod` | Servidor de producción (`dist/main`) |
| `npm run build` | Compilar TypeScript |
| `npm run lint` | ESLint con auto-fix |
| `npm run format` | Prettier |

### Testing

| Comando | Descripción |
|---|---|
| `npm run test` | Tests unitarios |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:cov` | Tests con reporte de cobertura |
| `npm run test:e2e` | Tests end-to-end |
| `npm run test:debug` | Tests con debugger |

### Prisma

| Comando | Descripción |
|---|---|
| `npx prisma generate` | Regenerar cliente Prisma (ejecutar tras cambios en schema) |
| `npx prisma migrate dev --name <nombre>` | Crear y aplicar migración |
| `npx prisma migrate deploy` | Aplicar migraciones en producción |
| `npx prisma studio` | Abrir interfaz gráfica de la BD |
| `npx prisma migrate reset` | Resetear BD (elimina todos los datos) |

---

## Arquitectura de Módulos

```
src/
├── auth/               # Autenticación JWT, login, registro, sesiones
├── users/              # Gestión de perfiles de usuario
├── pets/               # Perfiles de mascotas y subida de fotos
├── styles/             # Catálogo de estilos de arte IA
├── generations/        # Motor de generación IA (imágenes/videos)
│   ├── controllers/    # Endpoints de la API
│   ├── services/       # Lógica de negocio
│   ├── processors/     # Procesadores de colas BullMQ
│   └── dto/            # DTOs de validación
├── formats/            # Formatos de salida (aspect ratios, dimensiones)
├── products/           # Referencias de productos de Shopify
├── compat/             # Matriz de compatibilidad estilo/formato/producto
├── shopify-sync/       # Sincronización de productos Shopify (cron + webhooks)
├── gallery/            # Galería pública de generaciones completadas
├── storage/            # Integración con Cloudinary (módulo global)
├── webhooks/           # Receptores de webhooks para finalización de generaciones
├── prisma/             # Servicio de base de datos (módulo global)
├── config/             # Loaders de configuración (database, jwt, redis)
└── common/             # Utilidades compartidas
    ├── guards/         # JwtAuthGuard, RolesGuard
    ├── decorators/     # @Public(), @Roles(), @CurrentUser()
    ├── interceptors/   # LoggingInterceptor, TransformInterceptor
    ├── filters/        # HttpExceptionFilter
    └── utils/          # Paginación y utilidades generales
```

---

## Pipeline de Request/Response

Cada request pasa por el siguiente orden:

```
Request entrante
    │
    ├─ Raw body middleware (para verificación HMAC de webhooks Shopify)
    ├─ Cookie parser (cookies httpOnly)
    ├─ JwtAuthGuard (global — verifica token en cookie)
    ├─ RolesGuard (si el endpoint usa @Roles())
    ├─ ValidationPipe (valida y transforma DTOs)
    │
    ├─ Controller / Handler
    │
    ├─ TransformInterceptor (estandariza formato de respuesta)
    ├─ LoggingInterceptor (logging de requests/responses)
    └─ HttpExceptionFilter (formatea errores de forma consistente)
```

---

## Autenticación & Autorización

### Tokens JWT en cookies httpOnly

| Token | Duración | Cookie |
|---|---|---|
| Access Token | 15 minutos | `access_token` |
| Refresh Token | 7 días | `refresh_token` |

Las cookies son `httpOnly` (protección XSS) y `sameSite: lax` (protección CSRF).

Los refresh tokens se almacenan en base de datos y pueden revocarse individualmente o todos a la vez.

### Guard global

`JwtAuthGuard` está registrado como `APP_GUARD` — **todos los endpoints requieren autenticación por defecto**.

### Decoradores

```typescript
// Endpoint público (sin autenticación)
@Public()
@Post('login')
async login() { ... }

// Solo para admins
@Roles('admin')
@Get('stats')
async getStats() { ... }

// Inyectar usuario autenticado
@Get('me')
async getMe(@CurrentUser() user: JwtPayload) { ... }
```

---

## Endpoints de la API

Prefijo global: `/api` | Documentación interactiva: `http://localhost:3001/api/docs`

### Auth `/api/auth`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/register` | Registrar nuevo usuario | Publico |
| POST | `/login` | Iniciar sesión | Publico |
| POST | `/refresh` | Renovar access token | Publico |
| POST | `/logout` | Cerrar sesión | JWT |
| GET | `/me` | Usuario autenticado | JWT |
| GET | `/sessions` | Sesiones activas | JWT |
| POST | `/sessions/revoke/:tokenId` | Revocar sesión | JWT |
| POST | `/sessions/revoke-all` | Revocar todas las sesiones | JWT |

### Users `/api/users`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/me` | Obtener perfil | JWT |
| PATCH | `/me` | Actualizar perfil | JWT |

### Pets `/api/pets`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/` | Crear mascota | JWT |
| GET | `/` | Listar mascotas del usuario | JWT |
| GET | `/:id` | Detalle de mascota | JWT |
| PATCH | `/:id` | Actualizar mascota | JWT |
| DELETE | `/:id` | Eliminar mascota (soft delete) | JWT |
| GET | `/:id/photos` | Fotos de la mascota | JWT |
| POST | `/:id/photos` | Subir foto (multipart) | JWT |
| PATCH | `/:id/photos/:photoId` | Actualizar foto (orden/principal) | JWT |
| DELETE | `/:id/photos/:photoId` | Eliminar foto | JWT |

### Styles `/api/styles`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/` | Listar estilos activos | Publico |
| GET | `/categories` | Listar categorías | Publico |
| GET | `/category/:category` | Estilos por categoría | Publico |
| GET | `/:id` | Detalle de estilo | Publico |
| GET | `/:id/images` | Imágenes de ejemplo del estilo | Publico |

### Formats `/api/formats`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/` | Listar formatos activos | Publico |
| GET | `/:id` | Detalle de formato | Publico |

### Compatibilidad `/api/compat`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/formats?product_id=` | Formatos disponibles para un producto | Publico |
| GET | `/styles?product_id=&format_id=` | Estilos para combinación producto+formato | Publico |
| GET | `/formats-by-style?style_id=` | Formatos para un estilo | Publico |
| GET | `/products?style_id=&format_id=` | Productos para combinación estilo+formato | Publico |
| GET | `/check?style_id=&format_id=&product_id=` | Validar combinación | Publico |

### Products `/api/products`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/` | Listar productos | Publico |
| GET | `/:id` | Detalle de producto | Publico |

### Generations `/api/generations`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/` | Crear trabajo de generación | JWT |
| GET | `/` | Listar generaciones del usuario | JWT |
| GET | `/:id` | Detalle de generación | JWT |
| GET | `/:id/status` | Estado de generación (polling ligero) | JWT |
| PATCH | `/:id` | Actualizar flags (isPublic, isFavorite) | JWT |
| DELETE | `/:id` | Eliminar generación | JWT |

### Gallery `/api/gallery`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/` | Generaciones públicas (paginado) | Publico |
| GET | `/:genId` | Generación pública individual | Publico |

### Webhooks `/api/webhooks`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/generation-complete` | Callback de finalización de generación | Secret |
| POST | `/shopify/product/create` | Webhook de producto creado en Shopify | HMAC |
| POST | `/shopify/product/update` | Webhook de producto actualizado en Shopify | HMAC |

### Admin — Shopify Sync `/api/admin/products/sync`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/` | Sincronización manual | Admin |
| GET | `/status` | Estado del último sync | Admin |
| GET | `/history?limit=` | Historial de syncs | Admin |
| GET | `/health` | Health check del sistema de sync | Admin |

---

## Flujo de Generación IA

```
1. POST /api/generations
   └─ Valida: pet pertenece al usuario, estilo existe
   └─ Crea registro en BD con status: "pending"
   └─ Encola trabajo en BullMQ (cola: "image-generation")
   └─ Retorna el objeto Generation al cliente

2. BullMQ Worker (ImageGenerationProcessor)
   └─ Recoge trabajo de la cola
   └─ Actualiza status: "processing"
   └─ Llama al proveedor de IA (OpenAI / Stability AI)
   └─ En éxito: guarda resultUrl, thumbnailUrl, processingTimeSeconds
              status: "completed", completedAt: timestamp
   └─ En error: guarda errorMessage, status: "failed"

3. Cliente hace polling
   └─ GET /api/generations/:id/status
   └─ Responde solo { status, metadata? } (payload ligero)
   └─ Cuando status = "completed" → fetch completo del objeto
```

**Nota:** La integración con el proveedor de IA real (OpenAI/Stability) está pendiente de implementar. El procesador actualmente usa un placeholder de 3 segundos.

**Generaciones ilimitadas y gratuitas:** No hay sistema de créditos ni verificación de pago. Todos los usuarios pueden generar sin restricciones.

---

## Integración con Shopify

Los productos de Shopify se sincronizan con la base de datos local como `ProductReference` para poder asociarlos a estilos y formatos en la matriz de compatibilidad.

| Mecanismo | Detalle |
|---|---|
| Cron job | Cada 6 horas (`0 */6 * * *`) |
| Sync manual | `POST /api/admin/products/sync` (requiere rol admin) |
| Webhooks | `products/create` y `products/update` en tiempo real |
| Mutex | Previene syncs concurrentes |
| Trazabilidad | Cada sync queda registrado en `SyncLog` con estadísticas |

---

## Base de Datos

### Entidades principales

| Modelo | Descripción | Campos clave |
|---|---|---|
| `User` | Cuenta de usuario | `email`, `passwordHash`, `role` (user/premium/admin) |
| `RefreshToken` | Sesiones activas | `token`, `expiresAt`, `isRevoked` |
| `Pet` | Mascota del usuario | `name`, `species`, `breed`, `age` |
| `PetPhoto` | Fotos de mascotas | `photoUrl`, `photoStorageKey`, `isPrimary`, `orderIndex` |
| `Style` | Estilos de arte IA | `name`, `category`, `isPremium`, `parameters` |
| `StyleImage` | Imágenes de ejemplo de estilos | `imageUrl`, `isPrimary`, `orderIndex` |
| `Format` | Formatos de salida | `aspectRatio`, `width`, `height` |
| `ProductReference` | Productos de Shopify | `shopifyProductId`, `name` |
| `StyleFormatProductCompat` | Matriz de compatibilidad | `styleId`, `formatId`, `productRefId` |
| `Generation` | Trabajos de generación IA | `status`, `resultUrl`, `provider`, `processingTimeSeconds` |
| `AuditLog` | Registro de auditoría | `action`, `entityType`, `ipAddress` |
| `SyncLog` | Historial de syncs con Shopify | `type`, `status`, estadísticas de productos |

### Enums

| Campo | Valores |
|---|---|
| `User.role` | `user`, `premium`, `admin` |
| `Pet.species` | `dog`, `cat`, `bird`, `rabbit`, `other` |
| `Generation.type` | `image`, `video` |
| `Generation.status` | `pending`, `processing`, `completed`, `failed` |

### Comportamiento en cascada

- Eliminar `User` → elimina en cascada: pets, generations, refresh tokens, audit logs
- Eliminar `Pet` → elimina en cascada: photos y generations
- Eliminar `Style` → **restringido** si existen generations asociadas

---

## Documentación de API

Swagger UI disponible en: **`http://localhost:3001/api/docs`**

Incluye todos los endpoints, schemas de request/response y permite probar la API directamente desde el navegador.

---

## Solución de Problemas

**Redis no conecta (`ECONNREFUSED 127.0.0.1:6379`)**
```bash
# Instalar Redis (Ubuntu/WSL2)
sudo apt update && sudo apt install -y redis

# Iniciar el servicio
sudo service redis-server start

# Verificar
redis-cli ping  # → PONG
```
> Redis >= 6.2 requerido. Usa el repositorio oficial de Redis para obtener la versión más reciente.

**Cliente Prisma desincronizado**
```bash
npx prisma generate
```
Ejecutar siempre tras cambios en `prisma/schema.prisma` o al cambiar de rama.

**El backend no inicia**
- Verifica que PostgreSQL esté corriendo
- Confirma que `DATABASE_URL` en `.env.local` sea correcta
- Revisa que todos los secretos JWT estén definidos

**Errores de autenticación**
- Verifica que `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` estén definidos
- En desarrollo: asegúrate de que el frontend use `credentials: 'include'` en fetch
- Las cookies se configuran como `secure: true` solo en producción

**Cloudinary — errores de subida**
- Verifica `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Confirma que el preset de upload esté configurado correctamente en tu cuenta

**Shopify — webhooks no verifican**
- Verifica que `SHOPIFY_WEBHOOK_SECRET` coincida con el configurado en Shopify Admin
- Asegúrate de que `APP_PUBLIC_URL` sea la URL pública accesible desde internet
