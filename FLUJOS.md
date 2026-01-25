# Diagramas de Flujo - ClawAndSoul Backend

Este documento describe los flujos de trabajo principales del backend de ClawAndSoul, una plataforma de generación de contenido AI para mascotas.

## Tabla de Contenidos

- [Pipeline de Request/Response](#pipeline-de-requestresponse)
- [Flujo de Autenticación](#flujo-de-autenticación)
- [Flujo de Generación de Contenido AI](#flujo-de-generación-de-contenido-ai)
- [Flujo de Compra de Créditos (Shopify)](#flujo-de-compra-de-créditos-shopify)
- [Arquitectura de Módulos](#arquitectura-de-módulos)
- [Sistema de Guards y Decoradores](#sistema-de-guards-y-decoradores)

---

## Pipeline de Request/Response

Cada petición HTTP que llega al backend pasa por el siguiente pipeline en orden:

```mermaid
graph TD
    A[Request HTTP Entrante] --> B[CORS Validation]
    B --> C[LoggingInterceptor<br/>Registra: → METHOD URL]
    C --> D{JwtAuthGuard}
    D -->|Tiene @Public| F[ValidationPipe]
    D -->|Sin @Public| E{Token JWT válido?}
    E -->|No| Z1[❌ 401 Unauthorized]
    E -->|Sí| F
    F --> G{Validación DTO OK?}
    G -->|No| Z2[❌ 400 Bad Request]
    G -->|Sí| H[Controller Handler]
    H --> I{Error?}
    I -->|Sí| J[HttpExceptionFilter]
    I -->|No| K[TransformInterceptor<br/>Formato estándar]
    J --> L[Response con error]
    K --> M[LoggingInterceptor<br/>Registra: ← STATUS - XXms]
    M --> N[✅ Response exitoso]
```

### Componentes del Pipeline

1. **CORS Validation** ([main.ts:44](src/main.ts#L44))
   - Valida origen del request
   - Permite credenciales
   - Por defecto: `http://localhost:3000`

2. **LoggingInterceptor** ([logging.interceptor.ts](src/common/interceptors/logging.interceptor.ts))
   - Registra request entrante: `→ METHOD URL`
   - Registra response saliente: `← METHOD URL STATUS - XXms`
   - Calcula tiempo de respuesta

3. **JwtAuthGuard** ([jwt-auth.guard.ts](src/common/guards/jwt-auth.guard.ts))
   - Aplicado globalmente (todos los endpoints requieren auth)
   - Excepción: endpoints con decorador `@Public()`
   - Valida token JWT en header `Authorization: Bearer <token>`

4. **ValidationPipe** ([main.ts:25](src/main.ts#L25))
   - Valida DTOs automáticamente usando `class-validator`
   - `whitelist: true` - Elimina propiedades no definidas
   - `transform: true` - Transforma tipos automáticamente
   - `enableImplicitConversion: true` - Conversión de tipos primitivos

5. **TransformInterceptor** ([transform.interceptor.ts](src/common/interceptors/transform.interceptor.ts))
   - Envuelve todas las respuestas exitosas en formato estándar:
   ```json
   {
     "success": true,
     "data": { ... },
     "timestamp": "2026-01-23T10:00:00.000Z"
   }
   ```

6. **HttpExceptionFilter** ([http-exception.filter.ts](src/common/filters/http-exception.filter.ts))
   - Captura y formatea errores consistentemente
   - Maneja excepciones HTTP de NestJS

---

## Flujo de Autenticación

### Registro de Usuario

```mermaid
sequenceDiagram
    participant C as Cliente
    participant API as Auth Controller
    participant S as Auth Service
    participant DB as Prisma/Database
    participant CR as Credits Service

    C->>API: POST /api/auth/register
    Note over API: @Public() - No requiere auth
    API->>S: register(dto)
    S->>DB: Verificar email único
    alt Email ya existe
        DB-->>C: ❌ 409 Conflict
    else Email disponible
        S->>DB: Crear usuario (hash password)
        S->>CR: Crear UserCredits (balance: 0)
        S->>S: Generar tokens JWT
        S-->>C: ✅ { accessToken, refreshToken, user }
    end
```

### Login

```mermaid
sequenceDiagram
    participant C as Cliente
    participant API as Auth Controller
    participant S as Auth Service
    participant DB as Prisma/Database

    C->>API: POST /api/auth/login<br/>{email, password}
    Note over API: @Public()
    API->>S: login(dto)
    S->>DB: Buscar usuario por email
    alt Usuario no existe
        DB-->>C: ❌ 401 Unauthorized
    else Usuario existe
        S->>S: Comparar password (bcrypt)
        alt Password incorrecto
            S-->>C: ❌ 401 Unauthorized
        else Password correcto
            S->>S: Generar JWT tokens
            S-->>C: ✅ { accessToken, refreshToken, user }
        end
    end
```

### Refresh Token

```mermaid
sequenceDiagram
    participant C as Cliente
    participant API as Auth Controller
    participant S as Auth Service

    C->>API: POST /api/auth/refresh<br/>{refreshToken}
    Note over API: @Public()
    API->>S: refreshToken(token)
    S->>S: Verificar refresh token
    alt Token inválido/expirado
        S-->>C: ❌ 401 Unauthorized
    else Token válido
        S->>S: Generar nuevo access token
        S-->>C: ✅ { accessToken }
    end
```

### Protección de Endpoints

```mermaid
graph LR
    A[Request con JWT] --> B{Tiene @Public?}
    B -->|Sí| E[✅ Permitir acceso]
    B -->|No| C{Token válido?}
    C -->|No| D[❌ 401 Unauthorized]
    C -->|Sí| F{Tiene @Roles?}
    F -->|No| E
    F -->|Sí| G{Rol permitido?}
    G -->|No| H[❌ 403 Forbidden]
    G -->|Sí| I{Tiene @RequiredCredits?}
    I -->|No| E
    I -->|Sí| J{Créditos suficientes?}
    J -->|No| K[❌ 400 Bad Request]
    J -->|Sí| E
```

---

## Flujo de Generación de Contenido AI

Este es el flujo más complejo del sistema, manejando generaciones de imágenes y videos con IA.

### Flujo Completo de Generación

```mermaid
sequenceDiagram
    participant C as Cliente
    participant API as Generations Controller
    participant S as Generations Service
    participant CR as Credits Service
    participant DB as Prisma/Database
    participant AI as Proveedor AI
    participant ST as Storage Service (S3)

    C->>API: POST /api/generations/image<br/>{petId, styleId, prompt}
    Note over API: Requiere JWT
    API->>S: createImageGeneration(userId, dto)

    S->>DB: Verificar pet pertenece a user
    alt Pet no pertenece al usuario
        DB-->>C: ❌ 403 Forbidden
    end

    S->>DB: Obtener estilo y costo
    S->>CR: Verificar balance de créditos

    alt Créditos insuficientes
        CR-->>C: ❌ 400 Insufficient credits
    else Créditos suficientes
        S->>DB: Crear Generation (status: pending)
        S->>CR: Deducir créditos
        S->>DB: Registrar transacción (type: spent)
        S-->>C: ✅ {id, status: "pending", ...}

        Note over S,AI: Proceso asíncrono
        S->>AI: Enviar request generación

        alt Generación exitosa
            AI-->>S: URL imagen generada
            S->>ST: Descargar y subir a S3
            ST-->>S: URL en S3
            S->>DB: Actualizar Generation<br/>(status: completed, resultUrl)
        else Generación fallida
            AI-->>S: ❌ Error
            S->>DB: Actualizar Generation<br/>(status: failed, errorMessage)
            S->>CR: Reembolsar créditos
            S->>DB: Registrar transacción (type: refund)
        end
    end
```

### Estados de una Generación

```mermaid
stateDiagram-v2
    [*] --> pending: Crear generación
    pending --> processing: AI inicia proceso
    processing --> completed: Éxito + subir a S3
    processing --> failed: Error en AI
    failed --> [*]: Reembolso créditos
    completed --> [*]: Entrega al usuario

    note right of pending
        Créditos deducidos
        Request enviado a AI
    end note

    note right of completed
        Imagen en S3
        Usuario puede descargar
    end note

    note right of failed
        Créditos reembolsados
        Error registrado
    end note
```

### Consulta de Generaciones

```mermaid
sequenceDiagram
    participant C as Cliente
    participant API as Generations Controller
    participant S as Generations Service
    participant DB as Prisma/Database

    C->>API: GET /api/generations?page=1&limit=20&type=image
    API->>S: findUserGenerations(userId, filters)
    S->>DB: Query con filtros + paginación
    DB-->>S: [Lista de generaciones]
    S->>S: Calcular metadata paginación
    S-->>C: ✅ {data: [...], meta: {total, page, ...}}
```

---

## Flujo de Compra de Créditos (Shopify)

Integración con Shopify para compra de paquetes de créditos.

```mermaid
sequenceDiagram
    participant U as Usuario
    participant SH as Shopify Store
    participant API as Credits Controller
    participant S as Credits Service
    participant US as Users Service
    participant DB as Prisma/Database

    U->>SH: Compra paquete de créditos
    SH->>SH: Procesa pago
    SH->>API: POST /api/credits/shopify-webhook<br/>{order, customer}
    Note over API: @Public() - Webhook

    API->>S: processShopifyOrder(webhookData)
    S->>S: Validar signature Shopify

    alt Signature inválida
        S-->>SH: ❌ 401 Unauthorized
    else Signature válida
        S->>DB: Buscar usuario por email

        alt Usuario no existe
            S->>US: Crear usuario automático
            US->>DB: Crear User + UserCredits
        end

        S->>DB: Buscar producto Shopify
        alt Producto no configurado
            S-->>SH: ❌ 404 Product not found
        else Producto existe
            S->>DB: Crear ShopifyOrder
            S->>S: Calcular créditos a otorgar
            S->>DB: Incrementar balance usuario
            S->>DB: Registrar transacción (type: earned)
            S-->>SH: ✅ 200 OK

            Note over U: Usuario recibe email<br/>confirmación de créditos
        end
    end
```

### Tipos de Transacciones de Créditos

```mermaid
graph TD
    A[Credit Transaction] --> B{Tipo}
    B -->|earned| C[Compra Shopify<br/>Bonus/Promoción]
    B -->|spent| D[Generación AI<br/>Consumo de créditos]
    B -->|refund| E[Generación fallida<br/>Devolución de créditos]
    B -->|bonus| F[Créditos gratis<br/>Regalo admin]

    style C fill:#90EE90
    style D fill:#FFB6C6
    style E fill:#FFD700
    style F fill:#87CEEB
```

---

## Arquitectura de Módulos

Estructura modular basada en dominios (Domain-Driven Design).

```mermaid
graph TB
    subgraph "App Module (Root)"
        CM[ConfigModule<br/>Global]
        PM[PrismaModule<br/>Global]
        SM[StorageModule<br/>Global S3]
    end

    subgraph "Feature Modules"
        AM[AuthModule<br/>JWT + Passport]
        UM[UsersModule<br/>User Management]
        PE[PetsModule<br/>Pet Profiles]
        ST[StylesModule<br/>AI Styles Catalog]
        GM[GenerationsModule<br/>AI Engine]
        CR[CreditsModule<br/>Credits + Shopify]
    end

    CM -.->|Config| AM
    CM -.->|Config| UM
    CM -.->|Config| PE
    CM -.->|Config| ST
    CM -.->|Config| GM
    CM -.->|Config| CR

    PM -.->|Database| AM
    PM -.->|Database| UM
    PM -.->|Database| PE
    PM -.->|Database| ST
    PM -.->|Database| GM
    PM -.->|Database| CR

    SM -.->|S3 Upload| PE
    SM -.->|S3 Upload| GM

    AM -->|Depends| UM
    GM -->|Depends| PE
    GM -->|Depends| ST
    GM -->|Depends| CR
    CR -->|Depends| UM
```

### Responsabilidades de Cada Módulo

| Módulo | Responsabilidad | Endpoints Principales |
|--------|----------------|---------------------|
| **AuthModule** | Autenticación, JWT, login/register | `/api/auth/login`<br/>`/api/auth/register`<br/>`/api/auth/refresh` |
| **UsersModule** | Gestión de usuarios, perfiles | `/api/users/:id`<br/>`/api/users/profile` |
| **PetsModule** | Perfiles de mascotas, fotos | `/api/pets`<br/>`/api/pets/:id/photos` |
| **StylesModule** | Catálogo de estilos AI | `/api/styles`<br/>`/api/styles/:id` |
| **GenerationsModule** | Motor de generación AI | `/api/generations/image`<br/>`/api/generations/video` |
| **CreditsModule** | Balance, transacciones, Shopify | `/api/credits/balance`<br/>`/api/credits/shopify-webhook` |
| **StorageModule** | Upload/download S3 (global) | Usado internamente |
| **PrismaModule** | Acceso a base de datos (global) | Usado internamente |

---

## Sistema de Guards y Decoradores

NestJS utiliza Guards para proteger endpoints. Este backend implementa un sistema robusto de autorización.

### Jerarquía de Guards

```mermaid
graph TD
    A[Request] --> B[JwtAuthGuard<br/>Global - Todos los endpoints]
    B -->|@Public| Z[✅ Bypass - Endpoint público]
    B -->|Sin @Public| C[Validar JWT Token]
    C -->|Token inválido| Z1[❌ 401 Unauthorized]
    C -->|Token válido| D{RolesGuard<br/>¿Tiene @Roles?}
    D -->|No| W[✅ Continuar]
    D -->|Sí| E{Rol coincide?}
    E -->|No| Z2[❌ 403 Forbidden]
    E -->|Sí| F{RequiredCreditsGuard<br/>¿Tiene @RequiredCredits?}
    F -->|No| W
    F -->|Sí| G{Balance suficiente?}
    G -->|No| Z3[❌ 400 Bad Request]
    G -->|Sí| W
    W --> H[Controller Handler]
```

### Decoradores Disponibles

#### 1. `@Public()`
Permite acceso sin autenticación.

```typescript
@Public()
@Post('login')
async login(@Body() dto: LoginDto) {
  // No requiere JWT token
}
```

**Usado en:**
- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/refresh`
- `/api/credits/shopify-webhook`

#### 2. `@Roles(...roles)`
Restringe acceso a roles específicos.

```typescript
@Roles('admin', 'premium')
@Delete('users/:id')
async deleteUser(@Param('id') id: string) {
  // Solo admin o premium pueden ejecutar
}
```

**Roles disponibles:**
- `user` - Usuario estándar
- `premium` - Usuario con suscripción
- `admin` - Administrador del sistema

#### 3. `@RequiredCredits(amount)`
Verifica balance mínimo de créditos.

```typescript
@RequiredCredits(10)
@Post('generate')
async generate(@Body() dto: CreateGenerationDto) {
  // Requiere al menos 10 créditos
}
```

#### 4. `@CurrentUser()`
Inyecta el usuario autenticado en el handler.

```typescript
@Get('profile')
async getProfile(@CurrentUser() user: User) {
  // user contiene: { sub: userId, email, role }
}
```

### Ejemplo Completo

```typescript
@Controller('admin/generations')
@ApiTags('admin')
export class AdminGenerationsController {

  // Solo admin, requiere 50 créditos
  @Post('batch')
  @Roles('admin')
  @RequiredCredits(50)
  async batchGenerate(
    @CurrentUser() user: User,
    @Body() dto: BatchGenerateDto
  ) {
    // user.role === 'admin' garantizado
    // user tiene >= 50 créditos garantizado
  }
}
```

### Flujo de Ejecución de Guards

```mermaid
sequenceDiagram
    participant R as Request
    participant JG as JwtAuthGuard
    participant RG as RolesGuard
    participant CG as RequiredCreditsGuard
    participant H as Handler

    R->>JG: ¿Tiene @Public()?
    alt Tiene @Public()
        JG->>H: ✅ Permitir
    else No tiene @Public()
        JG->>JG: Validar JWT
        alt Token inválido
            JG-->>R: ❌ 401
        else Token válido
            JG->>RG: ¿Tiene @Roles()?
            alt Sin @Roles()
                RG->>CG: Continuar
            else Con @Roles()
                RG->>RG: Verificar rol
                alt Rol no permitido
                    RG-->>R: ❌ 403
                else Rol permitido
                    RG->>CG: Continuar
                end
            end

            CG->>CG: ¿Tiene @RequiredCredits()?
            alt Sin @RequiredCredits()
                CG->>H: ✅ Permitir
            else Con @RequiredCredits()
                CG->>CG: Verificar balance
                alt Balance insuficiente
                    CG-->>R: ❌ 400
                else Balance suficiente
                    CG->>H: ✅ Permitir
                end
            end
        end
    end
```

---

## Flujos de Casos de Uso Comunes

### Caso 1: Usuario Nuevo Genera su Primera Imagen

```mermaid
sequenceDiagram
    participant U as Usuario
    participant A as Auth
    participant P as Pets
    participant S as Shopify
    participant C as Credits
    participant G as Generations

    U->>A: Registro
    A-->>U: ✅ accessToken

    U->>P: Crear perfil mascota
    U->>P: Subir foto mascota
    P-->>U: ✅ Pet creado

    Note over U,S: Usuario necesita comprar créditos
    U->>S: Comprar paquete 100 créditos
    S->>C: Webhook confirmación
    C-->>U: ✅ Balance: 100 créditos

    U->>G: Generar imagen (costo: 10)
    G->>C: Deducir 10 créditos
    G-->>U: ✅ Generation pending

    Note over G: Proceso asíncrono AI
    G->>G: AI procesa
    G-->>U: 🔔 Generation completed

    U->>G: Descargar imagen
    G-->>U: ✅ URL S3
```

### Caso 2: Generación Fallida con Reembolso

```mermaid
sequenceDiagram
    participant U as Usuario
    participant G as Generations
    participant C as Credits
    participant AI as Proveedor AI
    participant DB as Database

    U->>G: POST /generations/image (costo: 15)
    G->>C: Verificar balance
    C-->>G: ✅ Balance: 50

    G->>C: Deducir 15 créditos
    C->>DB: Balance: 35
    G->>DB: Status: pending
    G-->>U: {id, status: "pending"}

    G->>AI: Request generación
    AI-->>G: ❌ Error 500 - Service unavailable

    G->>DB: Status: failed
    G->>C: Reembolsar 15 créditos
    C->>DB: Balance: 50 (restaurado)
    C->>DB: Transaction: refund

    Note over U: Usuario recibe notificación<br/>de fallo + reembolso
```

### Caso 3: Admin Otorga Créditos Bonus

```mermaid
sequenceDiagram
    participant A as Admin
    participant API as Credits Controller
    participant S as Credits Service
    participant DB as Database
    participant U as Usuario

    A->>API: POST /api/credits/grant<br/>{userId, amount: 50, reason: "Bonus"}
    Note over API: @Roles('admin')

    API->>S: grantCredits(userId, amount)
    S->>DB: Incrementar balance +50
    S->>DB: Registrar transacción (type: bonus)
    S-->>A: ✅ Balance actualizado

    Note over U: Usuario ve +50 créditos<br/>en su balance
```

---

## Notas Importantes

### Transacciones Atómicas

Todas las operaciones de créditos usan transacciones de Prisma para garantizar consistencia:

```typescript
await prisma.$transaction([
  prisma.userCredits.update({ ... }),
  prisma.creditTransaction.create({ ... }),
  prisma.generation.create({ ... }),
]);
```

### Cascadas de Eliminación

El esquema de base de datos usa cascadas para mantener integridad referencial:

- Eliminar `User` → elimina `pets`, `credits`, `generations`
- Eliminar `Pet` → elimina `photos`, `generations`
- Eliminar `Style` → **NO** elimina generaciones (usa `SetNull`)

### Manejo Asíncrono

Las generaciones AI son procesos asíncronos:
- El endpoint retorna inmediatamente con `status: "pending"`
- El proceso AI corre en background
- Cliente debe hacer polling o usar webhooks para conocer el resultado

### Seguridad

- Tokens JWT tienen expiración configurable
- Passwords hasheados con bcrypt
- Validación estricta de DTOs
- CORS configurado para frontend específico
- Webhooks de Shopify validan signature

---

## Referencias de Código

- [main.ts](src/main.ts) - Configuración global de la aplicación
- [app.module.ts](src/app.module.ts) - Módulo raíz y configuración de guards
- [jwt-auth.guard.ts](src/common/guards/jwt-auth.guard.ts) - Guard de autenticación
- [logging.interceptor.ts](src/common/interceptors/logging.interceptor.ts) - Logging de requests
- [transform.interceptor.ts](src/common/interceptors/transform.interceptor.ts) - Formato de respuestas
- [generations.controller.ts](src/generations/generations.controller.ts) - Endpoints de generación

---

## Swagger Documentation

Toda la API está documentada en Swagger UI:

**URL:** `http://localhost:3001/api/docs`

Incluye:
- Todos los endpoints
- DTOs y validaciones
- Códigos de respuesta
- Ejemplos de requests/responses
- Autenticación Bearer JWT
