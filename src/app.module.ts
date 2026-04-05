import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';

// Config imports
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import jwtConfig from './config/jwt.config';

// Module imports
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PetsModule } from './pets/pets.module';
import { StylesModule } from './styles/styles.module';
import { GenerationsModule } from './generations/generations.module';
import { StorageModule } from './storage/storage.module';
import { FormatsModule } from './formats/formats.module';
import { ProductsModule } from './products/products.module';
import { StyleCompatModule } from './style-compat/style-compat.module';
import { CompatModule } from './compat/compat.module';
import { GalleryModule } from './gallery/gallery.module';
import { WebhooksModule } from './webhooks/webhooks.module';

// Guards
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, jwtConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Schedule module for cron jobs
    ScheduleModule.forRoot(),

    // BullMQ - conexión global a Redis
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
          db: configService.get<number>('redis.db'),
        },
      }),
    }),

    // Core modules
    PrismaModule,
    AuthModule,
    UsersModule,
    PetsModule,
    StylesModule,
    GenerationsModule,
    StorageModule,
    FormatsModule,
    ProductsModule,
    StyleCompatModule,
    CompatModule,
    GalleryModule,
    WebhooksModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
