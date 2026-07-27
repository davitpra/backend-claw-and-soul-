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
 * Normaliza el valor del metafield `custom.art_kind` de Shopify.
 * Devuelve 'pbn' | 'print', o null si viene vacío o con un valor desconocido
 * (Shopify acepta texto libre si la definición no tiene validación de lista).
 */
export function normalizeArtKind(value?: string | null): string | null {
  const key = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, ' ');
  if (!key) return null;

  const match = ART_KIND_ALIASES[key];
  if (match) return match;

  logger.warn(
    `Unknown custom.art_kind value "${value}" — expected one of ${Object.keys(ART_KIND_ALIASES).join(', ')}; storing null`,
  );
  return null;
}
