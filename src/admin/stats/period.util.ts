/**
 * Ventanas de tiempo del dashboard. Cada periodo resuelve dos rangos de la misma
 * longitud —el actual y el inmediatamente anterior— para poder mostrar deltas.
 */

export type StatsPeriod = '3d' | '7d' | '30d' | '90d';

export const STATS_PERIODS: StatsPeriod[] = ['3d', '7d', '30d', '90d'];

const DAY_MS = 86_400_000;

export interface ResolvedPeriod {
  key: StatsPeriod;
  days: number;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

export function resolvePeriod(key: StatsPeriod = '30d'): ResolvedPeriod {
  const days = parseInt(key.replace('d', ''), 10);
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY_MS);
  // El periodo anterior termina donde arranca el actual: no se solapan, así el
  // delta compara dos ventanas disjuntas de la misma duración.
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - days * DAY_MS);

  return { key, days, from, to, prevFrom, prevTo };
}

export function isStatsPeriod(value: unknown): value is StatsPeriod {
  return STATS_PERIODS.includes(value as StatsPeriod);
}

/**
 * Variación porcentual contra el periodo anterior.
 *
 * Devuelve `null` cuando la base es 0: un "+100%" desde cero no informa de nada
 * y en la UI conviene mostrar un guion en vez de un número inventado.
 */
export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/** División protegida: `null` en vez de `NaN`/`Infinity` cuando no hay base. */
export function safeRatio(
  numerator: number,
  denominator: number,
): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}
