import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FxRateService } from '../../fx/fx-rate.service';
import { BASE_CURRENCY } from '../../expenses/expenses.service';
import { ResolvedPeriod } from './period.util';
import { CUSTOMER_ONLY_SQL } from './user-activity.util';

interface DayRow {
  day: Date;
  count: number;
}

interface OrderDayRow {
  day: Date;
  currency: string;
  count: number;
  revenue: number;
}

export interface TimelinePoint {
  day: string;
  generations: number;
  orders: number;
  revenue: number;
  newUsers: number;
}

/** Clave `YYYY-MM-DD` en UTC, la misma que produce `DATE_TRUNC(...)::date`. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Serie diaria unificada de generaciones, pedidos, ingresos y altas de usuarios.
 *
 * El esqueleto de días se construye en JS en vez de con `generate_series` para
 * que ningún día quede fuera del array por no tener filas: un hueco en la serie
 * dibuja una línea que salta el día en vez de bajar a cero.
 */
@Injectable()
export class TimelineStats {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fxRate: FxRateService,
  ) {}

  private buildDays(period: ResolvedPeriod): string[] {
    const days: string[] = [];
    const cursor = new Date(
      Date.UTC(
        period.from.getUTCFullYear(),
        period.from.getUTCMonth(),
        period.from.getUTCDate(),
      ),
    );
    const last = dayKey(period.to);

    while (dayKey(cursor) <= last) {
      days.push(dayKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return days;
  }

  async collect(period: ResolvedPeriod): Promise<TimelinePoint[]> {
    const [generationRows, orderRows, userRows] = await Promise.all([
      this.prisma.$queryRaw<DayRow[]>`
        SELECT
          DATE_TRUNC('day', created_at)::date AS day,
          COUNT(*)::int AS count
        FROM generations
        WHERE created_at >= ${period.from}
          AND created_at < ${period.to}
          AND is_admin_test = false
        GROUP BY day
        ORDER BY day ASC
      `,

      // Se agrupa también por moneda: sumar `total_amount` de varias divisas en
      // un mismo día daría un número sin significado. La conversión se hace
      // después, cubo a cubo.
      this.prisma.$queryRaw<OrderDayRow[]>`
        SELECT
          DATE_TRUNC('day', shopify_created_at)::date AS day,
          currency,
          COUNT(*)::int AS count,
          SUM(total_amount)::float AS revenue
        FROM orders
        WHERE shopify_created_at >= ${period.from}
          AND shopify_created_at < ${period.to}
          AND financial_status = 'paid'
        GROUP BY day, currency
        ORDER BY day ASC
      `,

      // El filtro de admins es el mismo `CUSTOMER_ONLY` que aplica `GrowthStats`,
      // aquí en su versión SQL: la suma de esta serie tiene que cuadrar con el
      // KPI `newUsers`, así que los dos sitios excluyen exactamente lo mismo.
      //
      // Sin filtrar por `status`: `GrowthStats.newUsers` tampoco lo hace, por el
      // mismo motivo. El filtro de borradas aplica solo a `totalUsers`, que es
      // un acumulado.
      this.prisma.$queryRaw<DayRow[]>`
        SELECT
          DATE_TRUNC('day', u.created_at)::date AS day,
          COUNT(*)::int AS count
        FROM users u
        WHERE u.created_at >= ${period.from}
          AND u.created_at < ${period.to}
          AND ${CUSTOMER_ONLY_SQL}
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    const points = new Map<string, TimelinePoint>(
      this.buildDays(period).map((day) => [
        day,
        { day, generations: 0, orders: 0, revenue: 0, newUsers: 0 },
      ]),
    );

    for (const row of generationRows) {
      const point = points.get(dayKey(row.day));
      if (point) point.generations = Number(row.count);
    }

    for (const row of userRows) {
      const point = points.get(dayKey(row.day));
      if (point) point.newUsers = Number(row.count);
    }

    for (const row of orderRows) {
      const point = points.get(dayKey(row.day));
      if (!point) continue;

      point.orders += Number(row.count);

      const amount = Number(row.revenue ?? 0);
      if (row.currency === BASE_CURRENCY) {
        point.revenue += amount;
        continue;
      }

      // `FxRateService` cachea el tipo en memoria, así que esto no dispara una
      // llamada de red por día.
      const converted = await this.fxRate.convert(
        amount,
        row.currency,
        BASE_CURRENCY,
      );
      point.revenue += converted ? converted.amount : amount;
    }

    return [...points.values()];
  }
}
