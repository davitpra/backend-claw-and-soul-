export type SortDirection = 'asc' | 'desc';

/**
 * Traduce los params `sort`/`order` de una query string al `orderBy` de Prisma.
 *
 * `builders` es la whitelist: solo las columnas que la UI puede ordenar tienen
 * entrada. Una `sort` desconocida cae al `fallback` en lugar de reventar — el
 * valor lo genera la propia tabla del admin desde su lista de columnas, así que
 * un 400 por un param cosmético no aportaría nada.
 *
 * ```ts
 * const orderBy = resolveOrderBy(ORDER_BY_FIELDS, DEFAULT_ORDER_BY, sort, order);
 * ```
 */
export function resolveOrderBy<T>(
  builders: Record<string, (direction: SortDirection) => T>,
  fallback: T,
  sort?: string,
  order?: string,
): T {
  const build = sort ? builders[sort] : undefined;
  if (!build) return fallback;
  return build(order === 'asc' ? 'asc' : 'desc');
}
