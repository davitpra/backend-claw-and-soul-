import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AccountStatusService } from './account-status.service';
import { AccountLifecycleService } from './account-lifecycle.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, AccountStatusService, AccountLifecycleService],
  exports: [UsersService, AccountStatusService],
})
export class UsersModule {}
