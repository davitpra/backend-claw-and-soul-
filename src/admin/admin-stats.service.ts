import { Injectable } from '@nestjs/common';
import { MoneyStats } from './stats/money.stats';
import { ProductionStats } from './stats/production.stats';
import { PipelineStats } from './stats/pipeline.stats';
import { GrowthStats } from './stats/growth.stats';
import { TimelineStats } from './stats/timeline.stats';
import { ActivityStats } from './stats/activity.stats';
import { StatsPeriod, resolvePeriod } from './stats/period.util';

/**
 * Orquestador del dashboard. No calcula nada: resuelve la ventana de tiempo y
 * compone lo que devuelven los colaboradores de `stats/`, que corren en
 * paralelo.
 */
@Injectable()
export class AdminStatsService {
  constructor(
    private readonly money: MoneyStats,
    private readonly production: ProductionStats,
    private readonly pipeline: PipelineStats,
    private readonly growth: GrowthStats,
    private readonly timeline: TimelineStats,
    private readonly activity: ActivityStats,
  ) {}

  async getOverview(periodKey: StatsPeriod = '30d') {
    const period = resolvePeriod(periodKey);

    const [money, production, pipeline, growth, timeline, activity] =
      await Promise.all([
        this.money.collect(period),
        this.production.collect(period),
        this.pipeline.collect(period),
        this.growth.collect(period),
        this.timeline.collect(period),
        this.activity.collect(period),
      ]);

    const { baseCurrency, ...moneyRest } = money;

    return {
      period: {
        key: period.key,
        days: period.days,
        from: period.from,
        to: period.to,
        prevFrom: period.prevFrom,
        prevTo: period.prevTo,
      },
      baseCurrency,
      money: moneyRest,
      production,
      pipeline,
      growth,
      timeline,
      ...activity,
    };
  }
}
