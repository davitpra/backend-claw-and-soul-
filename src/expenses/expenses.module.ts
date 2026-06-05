import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { ExpensesService } from './expenses.service';
import { ProviderRateService } from './provider-rate.service';
import { ExpensesController } from './expenses.controller';

@Module({
  imports: [FxModule],
  providers: [ExpensesService, ProviderRateService],
  controllers: [ExpensesController],
  exports: [ExpensesService, ProviderRateService],
})
export class ExpensesModule {}
