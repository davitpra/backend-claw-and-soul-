import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { CreditEconomicsService } from './credit-economics.service';
import { CreditsController } from './credits.controller';
import { AdminCreditsController } from './admin-credits.controller';

@Module({
  controllers: [CreditsController, AdminCreditsController],
  providers: [CreditsService, CreditEconomicsService],
  exports: [CreditsService, CreditEconomicsService],
})
export class CreditsModule {}
