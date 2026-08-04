import { Prisma } from '@prisma/client';

/**
 * Criterio único de «quién cuenta como usuario» y «quién está activo» para todo
 * el dashboard admin y el listado de /admin/users.
 *
 * Vivía duplicado a mano en `GrowthStats` y `TimelineStats`; al añadir la
 * segmentación por recencia y el filtro de actividad pasaba a estar en cinco
 * sitios, y la primera vez que uno divergiera dos cifras contiguas de la misma
 * pantalla se contradirían sin que nada fallara.
 */

/**
 * El equipo no es clientela: sus cuentas no cuentan como usuarios en ninguna
 * métrica del dashboard, o con poco tráfico las propias pruebas internas mueven
 * las cifras más que los clientes.
 */
export const CUSTOMER_ONLY = { role: { not: 'admin' } } as const;

/** Cuentas dadas de baja: fuera de los conteos, igual que en /admin/users. */
export const NOT_DELETED = { status: { not: 'deleted' } } as const;

/**
 * Espejos SQL de los dos filtros anteriores, para los `$queryRaw`. Asumen que la
 * tabla `users` está aliasada como `u`.
 *
 * La duplicación en SQL es inevitable —Prisma no traduce un `where` a fragmento
 * crudo—, pero al menos vive aquí al lado de su versión ORM: si uno cambia, el
 * otro está a tres líneas de distancia.
 */
export const CUSTOMER_ONLY_SQL = Prisma.sql`u.role <> 'admin'`;
export const NOT_DELETED_SQL = Prisma.sql`u.status <> 'deleted'`;

/**
 * Última señal de vida en SQL: el máximo entre login y actividad de sesión.
 *
 * El sentinela `epoch` no es cosmético. Sin él, para quien nunca entró la
 * expresión es `NULL`, `NULL >= cutoff` evalúa a `NULL` y un `COUNT(*) FILTER`
 * lo descarta de TODOS los buckets — con lo que activos + dormidos dejaría de
 * sumar la base y la card parecería rota.
 */
export const LAST_SEEN_SQL = Prisma.sql`GREATEST(
    COALESCE(u.last_seen_at,  TIMESTAMP 'epoch'),
    COALESCE(u.last_login_at, TIMESTAMP 'epoch')
  )`;

/**
 * Activo = dio señal de vida desde `cutoff`, por login o por uso de la app.
 *
 * Es el espejo positivo del criterio de `AccountLifecycleService.runInactivitySweep`:
 * `lastLoginAt` solo se escribe al autenticarse, así que por sí solo hace
 * parecer inactivo a quien usa la app a diario sin volver a loguearse.
 *
 * Ojo al componerlo: devuelve un `OR` de primer nivel, así que no se puede
 * fusionar con otro `where` que ya use `OR` (ver `listUsers`, que lo mete en un
 * `AND`).
 */
export function activeSince(cutoff: Date): Prisma.UserWhereInput {
  return {
    OR: [{ lastSeenAt: { gte: cutoff } }, { lastLoginAt: { gte: cutoff } }],
  };
}

/**
 * Complemento exacto de `activeSince`: ninguna de las dos señales alcanza el
 * corte. Los `null` cuentan como inactivos —quien nunca entró lleva más tiempo
 * sin dar señales que nadie—, y por eso hay que enumerarlos: en SQL un `NULL` no
 * es menor que nada.
 */
export function inactiveSince(cutoff: Date): Prisma.UserWhereInput {
  return {
    AND: [
      { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }] },
      { OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }] },
    ],
  };
}

/**
 * Registrados que nunca llegaron a usar el producto: sin mascota y sin ninguna
 * generación real.
 *
 * Es ortogonal a la recencia —alguien puede haber entrado ayer y seguir sin
 * activar—, así que este grupo CRUZA los buckets de activos y dormidos y no se
 * puede sumar con ellos.
 */
export const NEVER_ACTIVATED: Prisma.UserWhereInput = {
  pets: { none: {} },
  generations: { none: { isAdminTest: false } },
};
