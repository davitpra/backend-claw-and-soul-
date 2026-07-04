import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';

// Config imports
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import jwtConfig from './config/jwt.config';
import aiConfig from './config/ai.config';
import googleConfig from './config/google.config';

// Module imports
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PetsModule } from './pets/pets.module';
import { StylesModule } from './styles/styles.module';
import { GenerationsModule } from './generations/generations.module';
import { PaintByNumbersModule } from './paint-by-numbers/paint-by-numbers.module';
import { StorageModule } from './storage/storage.module';
import { FormatsModule } from './formats/formats.module';
import { ProductsModule } from './products/products.module';
import { StyleCompatModule } from './style-compat/style-compat.module';
import { CompatModule } from './compat/compat.module';
import { GalleryModule } from './gallery/gallery.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ShopifySyncModule } from './shopify-sync/shopify-sync.module';
import { AdminModule } from './admin/admin.module';
import { OrdersModule } from './orders/orders.module';
import { VisionConfigsModule } from './vision-configs/vision-configs.module';
import { ImageGenConfigsModule } from './image-gen-configs/image-gen-configs.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CartModule } from './cart/cart.module';

// Guards
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, jwtConfig, aiConfig, googleConfig],
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
    PaintByNumbersModule,
    StorageModule,
    FormatsModule,
    ProductsModule,
    StyleCompatModule,
    CompatModule,
    GalleryModule,
    WebhooksModule,
    ShopifySyncModule,
    AdminModule,
    OrdersModule,
    VisionConfigsModule,
    ImageGenConfigsModule,
    ExpensesModule,
    CartModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
