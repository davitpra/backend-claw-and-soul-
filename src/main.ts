import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

// Global /api prefix
// Global validation pipe
// Global filters and interceptors
// Request / response interceptors
// CORS configuration
// Swagger documentation

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

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

  // CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Swagger documentation
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
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;

  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(
    `📚 Swagger docs available at: http://localhost:${port}/api/docs`,
  );
}

bootstrap().catch((err) => {
  console.error('❌ Error starting application:', err);
  process.exit(1);
});
