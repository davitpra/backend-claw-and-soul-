import { Logger } from '@nestjs/common';

const logger = new Logger('ArtKind');

/** Valores válidos del eje de contenido de la obra. */
export const ART_KINDS = ['pbn', 'print'] as const;

/**
 * Alias aceptados del metafield `custom.art_kind`, ya en forma canónica
 * (minúsculas, separadores colapsados a un espacio).
 *
 * Shopify guarda la ETIQUETA visible de la definición, no el valor interno: en
 * la tienda están escritos como "PBN" y "Print art". El primero coincide con el
 * valor canónico por pura casualidad al bajarlo a minúsculas, el segundo no —
 * así que hay que mapear ambos explícitamente en vez de comparar contra
 * ART_KINDS. Añade aquí cualquier etiqueta nueva que se use en Shopify.
 */
const ART_KIND_ALIASES: Record<string, string> = {
  pbn: 'pbn',
  'paint by numbers': 'pbn',
  print: 'print',
  'print art': 'print',
};

/**
 * Escrituras del mismo metafield que marcan un accesorio. No son un contenido de
 * obra: los accesorios (pinceles, caballetes…) no llevan arte, así que este valor
 * NO aterriza en `artKind` sino en `ProductReference.isAccessory`. Mismo criterio
 * de alias que arriba — la tienda guarda la etiqueta visible, no el valor interno.
 */
const ACCESSORY_ALIASES = new Set([
  'accessory',
  'accesory',
  'accessories',
  'accesorio',
  'accesorios',
]);

/** Forma comparable de un valor del metafield: minúsculas y separadores a un espacio. */
function canonicalize(value?: string | null): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, ' ');
}

/**
 * Normaliza el valor del metafield `custom.art_kind` de Shopify.
 * Devuelve 'pbn' | 'print', o null si viene vacío, si marca un accesorio (que no
 * es un contenido de obra: ver `isAccessoryArtKind`) o si trae un valor
 * desconocido (Shopify acepta texto libre si la definición no valida la lista).
 */
export function normalizeArtKind(value?: string | null): string | null {
  const key = canonicalize(value);
  if (!key) return null;

  const match = ART_KIND_ALIASES[key];
  if (match) return match;

  // Valor conocido pero de otro eje: se enruta a isAccessory, no se avisa.
  if (ACCESSORY_ALIASES.has(key)) return null;

  logger.warn(
    `Unknown custom.art_kind value "${value}" — expected one of ${Object.keys(ART_KIND_ALIASES).join(', ')}; storing null`,
  );
  return null;
}

/**
 * ¿El valor del metafield marca al producto como accesorio? Es la fuente de
 * verdad de `ProductReference.isAccessory`, que a su vez decide en qué tabla del
 * admin cae el producto y que su OrderItem entre a producción directo en `draft`.
 */
export function isAccessoryArtKind(value?: string | null): boolean {
  return ACCESSORY_ALIASES.has(canonicalize(value));
}
