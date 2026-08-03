import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { OrdersModule } from '../orders/orders.module';
import { PaintByNumbersModule } from '../paint-by-numbers/paint-by-numbers.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // `AuthModule` entra solo por `AuthService.getActiveSessions`, que alimenta la
  // pestaña de sesiones. No hay ciclo: nadie importa `AdminModule`.
  imports: [
    PrismaModule,
    OrdersModule,
    PaintByNumbersModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [AdminStatsController, AdminUsersController],
  providers: [AdminStatsService, AdminUsersService],
})
export class AdminModule {}
