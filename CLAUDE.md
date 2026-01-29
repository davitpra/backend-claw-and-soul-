# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawAndSoul Backend is a NestJS API for an AI-powered pet image and video generation platform. Users upload pet photos and generate unlimited free stylized AI content of their pets.

## Development Commands

```bash
# Install dependencies
npm install

# Development
npm run start:dev          # Start with hot-reload
npm run start:debug        # Start with debugger

# Build
npm run build              # Compile TypeScript
npm run start:prod         # Run production build

# Code Quality
npm run lint               # Run ESLint with auto-fix
npm run format             # Format with Prettier

# Testing
npm run test               # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run with coverage
npm run test:e2e           # Run e2e tests
npm run test:debug         # Run with Node debugger
```

## Database & Prisma

The project uses Prisma ORM with PostgreSQL. Database: `clawandsoul_dev`

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create and apply migrations
npx prisma migrate dev --name <migration-name>

# Open Prisma Studio (database GUI)
npx prisma studio

# Reset database (warning: deletes all data)
npx prisma migrate reset
```

**Important**: Always run `npx prisma generate` after pulling schema changes or the Prisma client will be out of sync.

## Architecture

### Module Structure

The application follows NestJS modular architecture with domain-driven modules:

- **auth**: JWT-based authentication with refresh tokens, passport strategies
- **users**: User management and profile operations
- **pets**: Pet profiles and photo management
- **styles**: AI art style catalog (categories, parameters)
- **generations**: Core AI generation engine (images/videos), status tracking, provider abstraction
- **storage**: AWS S3 file upload/retrieval service (global module)
- **prisma**: Database service (global module)

### Global Configuration

Configuration is centralized in `src/config/`:
- `database.config.ts` - Database connection settings
- `jwt.config.ts` - JWT secret and expiration
- `redis.config.ts` - Redis/caching configuration

All configs loaded globally via `ConfigModule.forRoot()` in `app.module.ts`.

### Authentication & Authorization

- **Global JWT Guard**: All endpoints require authentication by default (`JwtAuthGuard` registered as `APP_GUARD`)
- **@Public() Decorator**: Use on controllers/routes to bypass authentication (e.g., login, register)
- **@Roles() Decorator**: Restrict endpoints to specific user roles (user, premium, admin)
- **@CurrentUser() Decorator**: Inject authenticated user into route handlers

Example:
```typescript
@Public()  // No auth required
@Post('login')
async login() { ... }

@Roles('admin')  // Admin only
@Delete('users/:id')
async deleteUser() { ... }

@Post('generate')
async generate(@CurrentUser() user: User) { ... }
```

### Request/Response Pipeline

1. **Logging Interceptor**: Logs all requests/responses
2. **Transform Interceptor**: Standardizes API response format
3. **Validation Pipe**: Validates DTOs (whitelist, transform enabled)
4. **HTTP Exception Filter**: Formats error responses consistently

### Key Patterns

**Prisma Service**: Injected globally. Access via constructor:
```typescript
constructor(private prisma: PrismaService) {}
```

**DTOs**: Use class-validator decorators. All DTOs auto-validated before reaching controllers.

**Database Relations**: The schema uses cascade deletes extensively:
- Deleting a User cascades to pets, generations, etc.
- Deleting a Pet cascades to photos and generations
- Use `onDelete: SetNull` for optional relations (e.g., generations can exist without petPhoto)

## API Documentation

Swagger UI available at: `http://localhost:3001/api/docs`

All endpoints prefixed with `/api` (configured in `main.ts`).

## Database Schema Highlights

**Core Entities**:
- **User**: Stores user credentials, role (user/premium/admin)
- **Pet**: User-owned pet profiles (species, breed, age)
- **PetPhoto**: Photos of pets with storage keys, order management
- **Style**: AI art styles with premium flags and parameters
- **Generation**: AI generation jobs with status tracking (pending/processing/completed/failed)

**Enums** (stored as strings):
- User role: `user`, `premium`, `admin`
- Pet species: `dog`, `cat`, `bird`, `rabbit`, `other`
- Generation type: `image`, `video`
- Generation status: `pending`, `processing`, `completed`, `failed`

## Free Generation Model

All image and video generations are FREE and UNLIMITED for all users. There are no credit checks or payment requirements. The role system (user/premium/admin) is preserved for future feature differentiation.

## Configuration

Environment variables are loaded from `.env.local` (priority) or `.env`.

**CORS**: Configured for frontend at `process.env.FRONTEND_URL` (default: `http://localhost:3000`)

**Port**: Defaults to 3001 if `PORT` env var not set

## MCP Servers

This project is configured with Model Context Protocol (MCP) servers to enhance Claude Code capabilities. See `MCP_SETUP.md` for detailed documentation.

### Configured Servers

1. **PostgreSQL MCP** - Direct database querying and schema inspection
2. **Context7 MCP** - Up-to-date documentation for NestJS, Prisma, etc.
3. **Redis MCP** - Cache inspection and session debugging
4. **Shopify MCP** - Product and order management integration

**Note**: For GitHub integration, use native `git` and `gh` CLI tools instead of an MCP server.

### Quick Start

1. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

2. Restart Claude Code to load MCP servers

3. Authenticate remote services:
   ```
   > /mcp
   ```

4. Use MCP capabilities in prompts:
   ```
   > "Show me all users in the database"
   > "Create a GitHub issue for this bug"
   > "Use context7 to show NestJS authentication docs"
   ```

### Managing MCP Servers

```bash
# List all MCP servers
> /mcp

# Or via CLI
claude mcp list
```

Configuration file: `.mcp.json` (shared with team via git)
