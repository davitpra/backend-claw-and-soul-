import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { MoneyStats } from './stats/money.stats';
import { ProductionStats } from './stats/production.stats';
import { PipelineStats } from './stats/pipeline.stats';
import { GrowthStats } from './stats/growth.stats';
import { TimelineStats } from './stats/timeline.stats';
import { ActivityStats } from './stats/activity.stats';
import { UsersStats } from './stats/users.stats';
import { UserCohortStats } from './stats/user-cohort.stats';
import { OrdersModule } from '../orders/orders.module';
import { PaintByNumbersModule } from '../paint-by-numbers/paint-by-numbers.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { CreditsModule } from '../credits/credits.module';
import { FxModule } from '../fx/fx.module';

@Module({
  // `AuthModule` entra solo por `AuthService.getActiveSessions`, que alimenta la
  // pestaña de sesiones. No hay ciclo: nadie importa `AdminModule`.
  //
  // `ExpensesModule`, `CreditsModule` y `FxModule` los usa el bloque de dinero
  // del dashboard, que reutiliza `globalSummary`/`globalEconomics` en vez de
  // recalcular los mismos agregados.
  imports: [
    PrismaModule,
    OrdersModule,
    PaintByNumbersModule,
    UsersModule,
    AuthModule,
    ExpensesModule,
    CreditsModule,
    FxModule,
  ],
  controllers: [AdminStatsController, AdminUsersController],
  providers: [
    AdminStatsService,
    AdminUsersService,
    MoneyStats,
    ProductionStats,
    PipelineStats,
    GrowthStats,
    TimelineStats,
    ActivityStats,
    UsersStats,
    UserCohortStats,
  ],
})
export class AdminModule {}
