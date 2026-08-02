/**
 * Tipo de item de un pedido. `OrderItem` no lo guarda: se deriva del
 * `ProductReference` de la línea. Espejo de
 * `frontend/src/entities/admin/lib/order-item-kind.ts` (mismo orden de reglas).
 *
 * Solo el arte pasa por el flujo de producción completo; los accesorios se
 * empacan y envían (sin arte) y los créditos no se producen ni se envían.
 */
export type OrderItemKind = 'art' | 'accessory' | 'credits';

export function orderItemKind(
  ref: {
    isCreditPack: boolean;
    isAccessory: boolean;
    template: string | null;
  } | null,
): OrderItemKind {
  if (ref?.isCreditPack || ref?.template === 'Credits') return 'credits';
  if (ref?.isAccessory || ref?.template === 'Accessory') return 'accessory';
  return 'art';
}
