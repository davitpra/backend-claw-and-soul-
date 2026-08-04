import { Injectable } from '@nestjs/common';
import { MoneyStats } from './stats/money.stats';
import { ProductionStats } from './stats/production.stats';
import { PipelineStats } from './stats/pipeline.stats';
import { GrowthStats } from './stats/growth.stats';
import { TimelineStats } from './stats/timeline.stats';
import { ActivityStats } from './stats/activity.stats';
import { UsersStats } from './stats/users.stats';
import { UserCohortStats } from './stats/user-cohort.stats';
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
    private readonly users: UsersStats,
    private readonly cohort: UserCohortStats,
  ) {}

  async getOverview(periodKey: StatsPeriod = '30d') {
    const period = resolvePeriod(periodKey);

    const [money, production, pipeline, growth, timeline, activity, users] =
      await Promise.all([
        this.money.collect(period),
        this.production.collect(period),
        this.pipeline.collect(period),
        this.growth.collect(period),
        this.timeline.collect(period),
        this.activity.collect(period),
        this.users.collect(period),
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
      users,
      timeline,
      ...activity,
    };
  }

  /**
   * Bloques pesados de la sección Usuarios, fuera del overview a propósito.
   *
   * El overview se pide en cada visita al dashboard y en cada cambio de periodo,
   * y lo pintan las cuatro secciones; esto solo se ve con Usuarios abierta. Son
   * además los dos únicos bloques cuyo costo escala con el número de usuarios y
   * no con el de agregados, y los dos toleran su propio esqueleto de carga.
   */
  async getUsersDetail(periodKey: StatsPeriod = '30d') {
    const period = resolvePeriod(periodKey);
    const detail = await this.cohort.collect(period);

    return {
      period: {
        key: period.key,
        days: period.days,
        from: period.from,
        to: period.to,
      },
      ...detail,
    };
  }
}
