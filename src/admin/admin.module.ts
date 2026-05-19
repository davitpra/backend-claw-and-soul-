import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminStatsController, AdminUsersController],
  providers: [AdminStatsService, AdminUsersService],
})
export class AdminModule {}
