import type { Logger } from '@nestjs/common';

/**
 * Ubicación estimada de una IP. Todo salvo `country` puede venir vacío: la base
 * gratuita de GeoLite2 tiene el país casi siempre y la ciudad pocas veces.
 *
 * Se devuelven los campos crudos (código ISO, no nombre) porque la traducción a
 * texto es presentación y vive en el front (`entities/admin/lib/geo-format.ts`).
 */
export interface GeoLocation {
  /** Código ISO 3166-1 alfa-2, p. ej. `ES`. */
  country: string;
  region: string | null;
  city: string | null;
  /** `Europe/Madrid`. Suele estar aunque falte la ciudad, y localiza igual. */
  timezone: string | null;
}

interface GeoipModule {
  lookup(ip: string): {
    country: string;
    region: string;
    city: string;
    timezone: string;
  } | null;
}

/**
 * `geoip-lite` carga su base entera en memoria (~100 MB) al importarse, así que
 * se hace `require` perezoso: un backend que nunca abra el panel de admin no
 * paga ese coste.
 */
let geoip: GeoipModule | null = null;
let loadFailed = false;

function getGeoip(logger?: Logger): GeoipModule | null {
  if (geoip || loadFailed) return geoip;
  try {
    // `require` y no `import`: la carga perezosa es justo lo que se busca, y un
    // `await import()` obligaría a volver async toda la cadena de llamadas.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    geoip = require('geoip-lite') as GeoipModule;
  } catch (error) {
    loadFailed = true;
    logger?.warn(`GeoIP database unavailable: ${String(error)}`);
  }
  return geoip;
}

/**
 * Ubicación estimada de una IP, o `null` si no se puede determinar: IP nula,
 * loopback, red privada o simplemente ausente de la base.
 *
 * Es una **estimación**: una VPN o el CGNAT de una operadora móvil devuelven la
 * ubicación del nodo de salida, no la de la persona.
 */
export function lookupLocation(
  ip: string | null | undefined,
  logger?: Logger,
): GeoLocation | null {
  if (!ip) return null;

  const module = getGeoip(logger);
  if (!module) return null;

  // Express entrega las IPv4 como IPv6 mapeadas (`::ffff:1.2.3.4`) cuando el
  // socket es dual-stack; `geoip-lite` las resuelve, pero se normaliza igual
  // para que el resto del código vea siempre la misma forma.
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  const hit = module.lookup(normalized);
  if (!hit?.country) return null;

  return {
    country: hit.country,
    // La base deja estos campos como cadena vacía cuando no los tiene.
    region: hit.region || null,
    city: hit.city || null,
    timezone: hit.timezone || null,
  };
}
