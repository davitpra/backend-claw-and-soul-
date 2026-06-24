import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopifyProductPayload } from './dto/shopify-product.dto';
import { ShopifyOrderPayload } from '../orders/dto/shopify-order.dto';

const WEBHOOK_TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
  'orders/create',
  'orders/paid',
  'orders/updated',
  'orders/cancelled',
  'orders/fulfilled',
  // FulfillmentOrders: los estados ricos (in_progress/on_hold/scheduled) cambian
  // SIN disparar orders/*, así que escuchamos sus topics para recalcular el
  // fulfillmentDisplayStatus de la orden afectada. (Nota: no existe un topic
  // `fulfillments/create|update` en la Admin API; el fulfilled lo cubre
  // orders/fulfilled y el partial lo cubre orders/updated.)
  'fulfillment_orders/placed_on_hold',
  'fulfillment_orders/hold_released',
  'fulfillment_orders/fulfillment_request_submitted',
  'fulfillment_orders/order_routing_complete',
  'fulfillment_orders/scheduled_fulfillment_order_ready',
  // Nota: `fulfillment_holds/*` y `fulfillments/*` NO se pueden registrar por la
  // REST webhooks API (404/422). Los holds merchant-managed los pone al día el
  // cron reconciliador de OrdersSyncService.
];
const PAGE_SIZE = 250;
const PAGE_DELAY_MS = 500;

@Injectable()
export class ShopifyApiService {
  private readonly logger = new Logger(ShopifyApiService.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('SHOPIFY_ADMIN_API_URL') ?? '';
    this.token =
      this.configService.get<string>('SHOPIFY_ADMIN_API_TOKEN') ?? '';
  }

  async fetchAllProducts(): Promise<ShopifyProductPayload[]> {
    const all: ShopifyProductPayload[] = [];
    let nextUrl: string | null =
      `${this.baseUrl}/products.json?limit=${PAGE_SIZE}`;

    while (nextUrl) {
      const response = await this.fetchWithRetry(nextUrl);
      const json = (await response.json()) as {
        products: ShopifyProductPayload[];
      };
      all.push(...json.products);

      nextUrl = this.extractNextPageUrl(response.headers.get('link'));

      if (nextUrl) {
        await this.delay(PAGE_DELAY_MS);
      }
    }

    this.logger.log(`Fetched ${all.length} products from Shopify`);
    return all;
  }

  async fetchProductById(
    shopifyProductId: string,
  ): Promise<ShopifyProductPayload | null> {
    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/products/${shopifyProductId}.json`,
      );
      const json = (await response.json()) as {
        product: ShopifyProductPayload;
      };
      return json.product ?? null;
    } catch {
      this.logger.warn(`Could not fetch Shopify product ${shopifyProductId}`);
      return null;
    }
  }

  async fetchAllOrders(sinceIso?: string): Promise<ShopifyOrderPayload[]> {
    const all: ShopifyOrderPayload[] = [];
    const since =
      sinceIso ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let nextUrl: string | null =
      `${this.baseUrl}/orders.json?status=any&limit=${PAGE_SIZE}&created_at_min=${encodeURIComponent(since)}`;

    while (nextUrl) {
      const response = await this.fetchWithRetry(nextUrl);
      const json = (await response.json()) as { orders: ShopifyOrderPayload[] };
      all.push(...json.orders);

      nextUrl = this.extractNextPageUrl(response.headers.get('link'));
      if (nextUrl) await this.delay(PAGE_DELAY_MS);
    }

    this.logger.log(`Fetched ${all.length} orders from Shopify since ${since}`);
    return all;
  }

  async fetchOrderById(
    shopifyOrderId: string,
  ): Promise<ShopifyOrderPayload | null> {
    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/orders/${shopifyOrderId}.json`,
      );
      const json = (await response.json()) as { order: ShopifyOrderPayload };
      return json.order ?? null;
    } catch {
      this.logger.warn(`Could not fetch Shopify order ${shopifyOrderId}`);
      return null;
    }
  }

  /**
   * Cancel an entire order in Shopify.
   * Requires the Admin token to have the `write_orders` scope.
   * @throws when Shopify responds non-2xx (caller decides strict vs best-effort).
   */
  async cancelOrder(
    shopifyOrderId: string,
    opts: {
      reason?: string;
      refund?: boolean;
      restock?: boolean;
      email?: boolean;
    } = {},
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      reason: opts.reason ?? 'other',
      refund: opts.refund ?? true,
      restock: opts.restock ?? true,
      email: opts.email ?? true,
    };

    const response = await this.postJson(
      `${this.baseUrl}/orders/${shopifyOrderId}/cancel.json`,
      body,
    );
    return response.json();
  }

  /**
   * Issue a partial refund for specific line items of an order (used when only
   * some items of a multi-item order are cancelled). Runs the two-step Shopify
   * flow: refunds/calculate.json → refunds.json.
   * Requires the Admin token to have the `write_orders` scope.
   * @throws when Shopify responds non-2xx.
   */
  async refundLineItems(
    shopifyOrderId: string,
    lineItems: Array<{ shopifyLineItemId: string; quantity: number }>,
    opts: { restock?: boolean; notify?: boolean } = {},
  ): Promise<unknown> {
    const restockType = opts.restock ? 'cancel' : 'no_restock';
    const refundLineItems = lineItems.map((li) => ({
      line_item_id: Number(li.shopifyLineItemId),
      quantity: li.quantity,
      restock_type: restockType,
    }));

    // Step 1: ask Shopify to calculate the refund (shipping, taxes, transactions).
    const calcResponse = await this.postJson(
      `${this.baseUrl}/orders/${shopifyOrderId}/refunds/calculate.json`,
      {
        refund: {
          shipping: { full_refund: false },
          refund_line_items: refundLineItems,
        },
      },
    );
    const calc = (await calcResponse.json()) as {
      refund: { transactions?: Array<Record<string, unknown>> };
    };

    // Step 2: create the refund, replaying the calculated transactions as
    // pending refunds against their parent transactions.
    const transactions = (calc.refund.transactions ?? []).map((t) => ({
      parent_id: t.parent_id,
      amount: t.amount,
      kind: 'refund',
      gateway: t.gateway,
    }));

    const createResponse = await this.postJson(
      `${this.baseUrl}/orders/${shopifyOrderId}/refunds.json`,
      {
        refund: {
          notify: opts.notify ?? true,
          refund_line_items: refundLineItems,
          transactions,
        },
      },
    );
    return createResponse.json();
  }

  /**
   * Create a Shopify fulfillment (with optional tracking) for a single order
   * line item, using the FulfillmentOrders flow required by Admin API 2024-01+
   * (the legacy `POST /orders/{id}/fulfillments.json` was removed).
   *
   * Idempotent by construction: a line item that is already fully fulfilled has
   * no fulfillable quantity left in its fulfillment order, so we skip it and
   * return null instead of creating a duplicate. This makes it safe to call
   * from the POD sync (which can re-run) and the manual admin paths alike.
   *
   * Requires the Admin token to have the `write_merchant_managed_fulfillment_orders`
   * (a.k.a. `write_assigned_fulfillment_orders`) scope.
   *
   * @returns the created fulfillment object, or null when there was nothing to
   *   fulfill (already fulfilled / line item not found).
   */
  async createFulfillment(
    shopifyOrderId: string,
    lineItem: { shopifyLineItemId: string; quantity: number },
    tracking?: { number?: string; company?: string; url?: string },
    opts: { notify?: boolean } = {},
  ): Promise<unknown> {
    // Step 1: list the order's fulfillment orders and locate the open
    // fulfillment-order line that still has quantity left for our line item.
    const foResponse = await this.fetchWithRetry(
      `${this.baseUrl}/orders/${shopifyOrderId}/fulfillment_orders.json`,
    );
    const { fulfillment_orders: fulfillmentOrders = [] } =
      (await foResponse.json()) as {
        fulfillment_orders?: Array<{
          id: number;
          line_items: Array<{
            id: number;
            line_item_id: number;
            fulfillable_quantity: number;
          }>;
        }>;
      };

    const targetLineItemId = Number(lineItem.shopifyLineItemId);
    for (const fo of fulfillmentOrders) {
      const foLine = fo.line_items.find(
        (li) =>
          li.line_item_id === targetLineItemId && li.fulfillable_quantity > 0,
      );
      if (!foLine) continue;

      const quantity = Math.min(lineItem.quantity, foLine.fulfillable_quantity);

      // Step 2: create the fulfillment for just this fulfillment-order line.
      const response = await this.postJson(
        `${this.baseUrl}/fulfillments.json`,
        {
          fulfillment: {
            notify_customer: opts.notify ?? true,
            line_items_by_fulfillment_order: [
              {
                fulfillment_order_id: fo.id,
                fulfillment_order_line_items: [{ id: foLine.id, quantity }],
              },
            ],
            ...(tracking?.number
              ? {
                  tracking_info: {
                    number: tracking.number,
                    company: tracking.company ?? null,
                    url: tracking.url ?? null,
                  },
                }
              : {}),
          },
        },
      );

      const json = (await response.json()) as { fulfillment?: unknown };
      this.logger.log(
        `Shopify fulfillment created: order=${shopifyOrderId} line=${targetLineItemId} qty=${quantity} tracking=${tracking?.number ?? 'none'}`,
      );
      return json.fulfillment ?? null;
    }

    this.logger.debug(
      `No open fulfillment order for line ${targetLineItemId} on order ${shopifyOrderId}; nothing to fulfill`,
    );
    return null;
  }

  /**
   * Resuelve el estado de fulfillment "display" de un pedido (lo que el cliente
   * ve en su badge), fiel a Shopify. El `fulfillment_status` simple de la orden
   * solo tiene unfulfilled/partial/fulfilled/restocked; los estados ricos que el
   * admin de Shopify muestra (in_progress, on_hold, scheduled) viven en los
   * FulfillmentOrders, así que los traemos de `GET fulfillment_orders.json` y los
   * agregamos a un único estado por orden. Best-effort: si la llamada falla,
   * caemos al `fulfillment_status` simple.
   */
  async getFulfillmentDisplayStatus(
    shopifyOrderId: string,
    orderFulfillmentStatus?: string | null,
  ): Promise<string | null> {
    // El restock (cancelación/refund) lo refleja directo el estado de la orden.
    if (orderFulfillmentStatus === 'restocked') return 'restocked';

    let foStatuses: string[] = [];
    try {
      const res = await this.fetchWithRetry(
        `${this.baseUrl}/orders/${shopifyOrderId}/fulfillment_orders.json`,
      );
      const { fulfillment_orders: fos = [] } = (await res.json()) as {
        fulfillment_orders?: Array<{ status: string }>;
      };
      foStatuses = fos.map((f) => f.status);
    } catch {
      this.logger.warn(
        `Could not fetch fulfillment_orders for order ${shopifyOrderId}; usando fulfillment_status simple`,
      );
    }

    return this.deriveFulfillmentDisplayStatus(
      foStatuses,
      orderFulfillmentStatus ?? null,
    );
  }

  /**
   * Agrega los estados de los FulfillmentOrders a un único estado por orden.
   * Devuelve uno de: unfulfilled | in_progress | on_hold | scheduled |
   * partially_fulfilled | fulfilled | restocked.
   */
  private deriveFulfillmentDisplayStatus(
    foStatuses: string[],
    orderStatus: string | null,
  ): string {
    // Sin FulfillmentOrders (raro): caemos al fulfillment_status simple.
    if (foStatuses.length === 0) {
      if (orderStatus === 'fulfilled') return 'fulfilled';
      if (orderStatus === 'partial') return 'partially_fulfilled';
      if (orderStatus === 'restocked') return 'restocked';
      return 'unfulfilled';
    }

    // cancelled/incomplete no cuentan para el estado activo del pedido.
    const active = foStatuses.filter(
      (s) => s !== 'cancelled' && s !== 'incomplete',
    );
    if (active.length === 0) return 'unfulfilled';
    if (active.includes('on_hold')) return 'on_hold';
    if (active.includes('scheduled')) return 'scheduled';
    if (active.every((s) => s === 'closed')) return 'fulfilled';
    if (active.includes('closed')) return 'partially_fulfilled';
    if (active.includes('in_progress')) return 'in_progress';
    return 'unfulfilled'; // todos open
  }

  /** POST helper for Admin write calls. Throws with the Shopify body on failure. */
  private async postJson(url: string, body: unknown): Promise<Response> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.token,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Shopify write error ${response.status} at ${url}: ${detail}`,
      );
    }

    return response;
  }

  async registerWebhooks(appPublicUrl: string): Promise<void> {
    for (const topic of WEBHOOK_TOPICS) {
      const [resource, event] = topic.split('/');
      const address = `${appPublicUrl}/api/webhooks/shopify/${resource.replace(/s$/, '')}/${event}`;

      try {
        const response = await fetch(`${this.baseUrl}/webhooks.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': this.token,
          },
          body: JSON.stringify({
            webhook: { topic, address, format: 'json' },
          }),
        });

        if (response.status === 422) {
          this.logger.debug(`Webhook already registered for topic: ${topic}`);
        } else if (!response.ok) {
          this.logger.error(
            `Failed to register webhook for topic ${topic}: ${response.status}`,
          );
        } else {
          this.logger.log(
            `Registered webhook for topic: ${topic} → ${address}`,
          );
        }
      } catch (err) {
        this.logger.error(`Error registering webhook for topic ${topic}`, err);
      }
    }
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    const response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': this.token },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 2000;
      this.logger.warn(`Rate limited by Shopify, retrying after ${waitMs}ms`);
      await this.delay(waitMs);
      return this.fetchWithRetry(url);
    }

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${url}`);
    }

    return response;
  }

  private extractNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    // Link header format: <url>; rel="next", <url>; rel="previous"
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
