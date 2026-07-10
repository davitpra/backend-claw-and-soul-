import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';
import { AdminCreditsController } from './admin-credits.controller';

@Module({
  controllers: [CreditsController, AdminCreditsController],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
