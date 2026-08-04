import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import cookieParser from 'cookie-parser';
import * as express from 'express';

// Global /api prefix
// Global validation pipe
// Global filters and interceptors
// Request / response interceptors
// CORS configuration
// Swagger documentation

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: isProduction
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug'],
  });

  // Detrás del proxy de la plataforma (Railway, Render, Nginx) req.ip devolvería
  // la IP del balanceador; sin esto el geoip de las sesiones registra basura.
  app.set('trust proxy', 1);

  // Raw body required for Shopify HMAC webhook verification.
  // Must be registered before setGlobalPrefix and cookieParser so the
  // route-specific middleware takes precedence over the global JSON parser.
  app.use('/api/webhooks/shopify', express.raw({ type: '*/*' }));

  // Global prefix
  app.setGlobalPrefix('api');

  // Cookie parser for httpOnly cookies
  app.use(cookieParser());

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that do not have any decorators
      forbidNonWhitelisted: true, // Throw an error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Enable implicit type conversion
      },
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter()); // HTTP exception filter for consistent error responses
  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(), // Logging interceptor for request/response logging for monitoring
    new TransformInterceptor(), // Transform interceptor for consistent response formatting
  );

  // CORS. Outside production the local dev origins stay allowed on top of
  // FRONTEND_URL, so pointing that variable at some other host (a preview
  // deploy, a device on the LAN) can't lock out http://localhost:3000.
  const localOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  // FRONTEND_URL admite varios orígenes separados por comas (el dominio real y
  // el de staging, p. ej.). Cada uno se compara por igualdad exacta contra la
  // cabecera Origin, así que van enteros y con esquema: 'clawandsoul.com' y
  // 'www.clawandsoul.com' son dos orígenes distintos y hay que listar el que se
  // sirva. No pongas aquí un host fuera de .clawandsoul.com esperando que la
  // sesión funcione: la cookie es sameSite=lax y el navegador la descarta en
  // peticiones cross-site aunque el CORS pase.
  //
  // Origin headers never carry a trailing slash; .env values sometimes do.
  const configuredOrigins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const allowedOrigins = [
    ...configuredOrigins,
    ...(isProduction ? [] : localOrigins),
  ];

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : localOrigins,
    credentials: true,
  });

  // Swagger documentation. En producción queda apagado salvo que se active a
  // mano: /api/docs publica toda la superficie de la API (incluidos los
  // endpoints de admin) sin pedir credenciales.
  const swaggerEnabled = process.env.SWAGGER_ENABLED
    ? process.env.SWAGGER_ENABLED === 'true'
    : !isProduction;

  const config = new DocumentBuilder()
    .setTitle('Pet AI API')
    .setDescription('API for AI-powered pet image and video generation')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('pets', 'Pet management')
    .addTag('styles', 'Art styles')
    .addTag('generations', 'Image and video generation')
    .addTag('credits', 'Credit management')
    .build();

  // create swagger document api at /api/docs
  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3001;

  // '0.0.0.0' es obligatorio dentro de un contenedor: el default de Node solo
  // escucharía en la interfaz local y el healthcheck de la plataforma fallaría.
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on port ${port}`);
  if (swaggerEnabled) {
    console.log(`📚 Swagger docs available at /api/docs`);
  }
}

bootstrap().catch((err) => {
  console.error('❌ Error starting application:', err);
  process.exit(1);
});
