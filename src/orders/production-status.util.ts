import { OrderItemKind } from './order-item-kind.util';

/**
 * Vocabulario y reglas del `productionStatus` de un OrderItem.
 *
 * Modelo: columna almacenada por item. El estado TEMPRANO se auto-asigna desde
 * el pago (Shopify `financial_status`) + la generación de imagen; desde `draft`
 * el admin lo avanza a mano (ya no hay sincronización con POD). El fulfillment
 * de Shopify es informativo y NO alimenta este eje.
 */

export type ProductionStatus =
  | 'pending'
  | 'generating'
  | 'art_failed'
  | 'draft'
  | 'pre_production'
  | 'in_production'
  | 'printed'
  | 'shipped'
  | 'delivered'
  | 'on_hold'
  | 'cancelled'
  | 'refunded'
  | 'restocked';

/**
 * Estados tempranos auto-gestionados (pago + generación). Mientras el item esté
 * en uno de estos, el sistema puede recomputarlo automáticamente; una vez el
 * admin avanza (`draft` → `pre_production` → …) ya no se pisa.
 */
export const EARLY_AUTO_STATUSES: string[] = [
  'pending',
  'generating',
  'art_failed',
  'draft',
];

/** Estados terminales / no-activos. */
export const TERMINAL_STATUSES: string[] = [
  'delivered',
  'cancelled',
  'refunded',
  'restocked',
];

/**
 * Estados que entran en la cola de producción ("estudio de impresión"): items
 * pagados con arte listo y aún por fabricar/imprimir. Excluye tempranos no
 * listos (`pending`/`generating`/`art_failed`) y los ya enviados/terminales.
 */
export const PRODUCTION_QUEUE_STATUSES: string[] = [
  'draft',
  'pre_production',
  'in_production',
  'printed',
];

/**
 * Transiciones manuales válidas (admin) del flujo de arte, y default del resto de
 * tipos. Los estados tempranos se omiten del avance porque los gobierna la
 * auto-asignación; solo se permite cancelar o reembolsar desde ellos.
 * Los accesorios usan `ACCESSORY_VALID_TRANSITIONS` — resuelve `transitionsFor`.
 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['cancelled', 'refunded'],
  generating: ['cancelled', 'refunded'],
  art_failed: ['cancelled', 'refunded'],
  draft: ['pre_production', 'on_hold', 'cancelled', 'refunded'],
  pre_production: ['in_production', 'on_hold', 'cancelled', 'refunded'],
  in_production: ['printed', 'on_hold', 'cancelled', 'refunded'],
  printed: ['shipped', 'on_hold', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded', 'restocked'],
  on_hold: ['pre_production', 'in_production', 'cancelled', 'refunded'],
  cancelled: [],
  refunded: [],
  restocked: [],
};

/**
 * Transiciones de un item de accesorio (kit, pinceles). No se genera ni se
 * imprime nada: del pago pasa a preparar el envío y de ahí a enviado, saltando
 * `pre_production`/`in_production`/`printed`.
 *
 * Esos tres estados sí aparecen como origen porque un accesorio pudo avanzar a
 * ellos con la máquina anterior (compartida con el arte); son escape hatches
 * heredados hacia `shipped`, no parte del flujo nuevo.
 */
export const ACCESSORY_VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['cancelled', 'refunded'],
  generating: ['cancelled', 'refunded'],
  art_failed: ['cancelled', 'refunded'],
  draft: ['shipped', 'on_hold', 'cancelled', 'refunded'],
  pre_production: ['shipped', 'on_hold', 'cancelled', 'refunded'],
  in_production: ['shipped', 'on_hold', 'cancelled', 'refunded'],
  printed: ['shipped', 'on_hold', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded', 'restocked'],
  on_hold: ['draft', 'cancelled', 'refunded'],
  cancelled: [],
  refunded: [],
  restocked: [],
};

/**
 * Transiciones manuales válidas para un item según su tipo. Arte y créditos usan
 * la máquina completa; los accesorios, la reducida.
 */
export function transitionsFor(status: string, kind: OrderItemKind): string[] {
  const map =
    kind === 'accessory' ? ACCESSORY_VALID_TRANSITIONS : VALID_TRANSITIONS;
  return map[status] ?? [];
}

/**
 * Estados que representan una compra deshecha (cancelada o devuelta) y que
 * deben disparar el clawback de los créditos otorgados por la línea. Al entrar
 * un item en uno de estos, se revierte su parte del bono/pack.
 */
export const CLAWBACK_STATUSES: string[] = [
  'cancelled',
  'refunded',
  'restocked',
];

/** Estados desde los que un item aún puede cancelarse (no enviado todavía). */
export const CANCELLABLE_STATUSES: string[] = [
  'pending',
  'generating',
  'art_failed',
  'draft',
  'pre_production',
  'in_production',
  'printed',
];

/**
 * Estado temprano derivado del pago (Shopify `financial_status`) + la generación
 * del arte. Reemplaza al antiguo `financialToProductionStatus`.
 *
 * - Pagos no completados → `pending` (Pago pendiente).
 * - Reembolso/void → terminal correspondiente.
 * - Pagado: depende de la generación → `art_failed` / `generating` / `draft`.
 */
export function computeAutoEarlyStatus(
  financialStatus?: string | null,
  generationStatus?: string | null,
  isAccessory = false,
): ProductionStatus {
  switch (financialStatus) {
    case 'refunded':
    case 'partially_refunded':
      return 'refunded';
    case 'voided':
      return 'cancelled';
    case 'pending':
    case 'authorized':
    case 'partially_paid':
      return 'pending';
  }
  // Accesorios: stock propio genérico, sin arte generado por IA. Una vez pagada
  // la orden entran directo a `draft` (cola de producción manual); nunca pasan
  // por `generating`/`art_failed`. El admin avanzará draft → shipped a mano.
  if (isAccessory) return 'draft';
  // Pagado (`paid` u otros/ausente): el estado depende del arte.
  if (generationStatus === 'failed') return 'art_failed';
  if (generationStatus === 'pending' || generationStatus === 'processing') {
    return 'generating';
  }
  return 'draft'; // completed o sin generación enlazada
}

/** True si el estado actual aún lo gobierna la auto-asignación. */
export function isEarlyAutoStatus(status: string): boolean {
  return EARLY_AUTO_STATUSES.includes(status);
}
