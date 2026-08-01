import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { OrdersModule } from '../orders/orders.module';
import { PaintByNumbersModule } from '../paint-by-numbers/paint-by-numbers.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, OrdersModule, PaintByNumbersModule, UsersModule],
  controllers: [AdminStatsController, AdminUsersController],
  providers: [AdminStatsService, AdminUsersService],
})
export class AdminModule {}
