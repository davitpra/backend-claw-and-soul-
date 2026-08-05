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
  // Sin este topic, borrar una orden en Shopify deja el registro local huérfano
  // para siempre: Shopify no vuelve a emitir nada sobre ella.
  'orders/delete',
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
/** Página GraphQL más corta que la REST: el subcampo `metafield` encarece el coste. */
const GRAPHQL_PAGE_SIZE = 100;
const THROTTLE_RETRY_MS = 2000;

const ART_KIND_METAFIELD = { namespace: 'custom', key: 'art_kind' } as const;

const ART_KIND_PAGE_QUERY = `
  query artKindPage($first: Int!, $cursor: String) {
    products(first: $first, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        metafield(namespace: "${ART_KIND_METAFIELD.namespace}", key: "${ART_KIND_METAFIELD.key}") { value }
      }
    }
  }
`;

const PRODUCT_ART_KIND_QUERY = `
  query productArtKind($id: ID!) {
    product(id: $id) {
      metafield(namespace: "${ART_KIND_METAFIELD.namespace}", key: "${ART_KIND_METAFIELD.key}") { value }
    }
  }
`;

interface ArtKindPageResponse {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{ id: string; metafield: { value: string } | null }>;
  };
}

interface ProductArtKindResponse {
  product: { metafield: { value: string } | null } | null;
}

/** `gid://shopify/Product/123` → `123` (así se guarda en ProductReference). */
function numericIdFromGid(gid: string): string {
  return gid.split('/').pop() ?? gid;
}

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

  /**
   * Mapa shopifyProductId → valor crudo del metafield `custom.art_kind`, que es
   * la fuente de verdad del eje de contenido (coloreable vs arte terminado).
   * El REST `products.json` no devuelve metafields, así que esto va por GraphQL:
   * una llamada por página en vez de una por producto.
   * Un producto sin el metafield entra en el mapa con `null` — el llamador
   * necesita distinguirlo de "producto no visto".
   * @throws si Shopify falla; el llamador decide si aborta o sigue sin artKind.
   */
  async fetchArtKindMap(): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    let cursor: string | null = null;

    do {
      const data: ArtKindPageResponse = await this.graphql<ArtKindPageResponse>(
        ART_KIND_PAGE_QUERY,
        { first: GRAPHQL_PAGE_SIZE, cursor },
      );

      for (const node of data.products.nodes) {
        map.set(numericIdFromGid(node.id), node.metafield?.value ?? null);
      }

      cursor = data.products.pageInfo.hasNextPage
        ? data.products.pageInfo.endCursor
        : null;
      if (cursor) await this.delay(PAGE_DELAY_MS);
    } while (cursor);

    this.logger.log(`Fetched custom.art_kind for ${map.size} Shopify products`);
    return map;
  }

  /**
   * Valor crudo de `custom.art_kind` de un solo producto, para la ruta del
   * webhook (cuyo payload no trae metafields).
   * Devuelve `undefined` cuando la llamada falla, para que el llamador deje la
   * columna intacta en vez de confundir el fallo con "no tiene valor".
   */
  async fetchProductArtKind(
    shopifyProductId: string,
  ): Promise<string | null | undefined> {
    try {
      const data = await this.graphql<ProductArtKindResponse>(
        PRODUCT_ART_KIND_QUERY,
        { id: `gid://shopify/Product/${shopifyProductId}` },
      );
      return data.product?.metafield?.value ?? null;
    } catch {
      this.logger.warn(
        `Could not fetch custom.art_kind for product ${shopifyProductId}; leaving artKind untouched`,
      );
      return undefined;
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

  /**
   * GraphQL Admin helper. Se usa para lo que el REST no expone (metafields).
   * GraphQL responde 200 aunque haya errores, así que hay que mirar `errors[]`;
   * el throttling por coste se reintenta una vez.
   * @throws con el detalle de Shopify si la consulta falla.
   */
  private async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
    isRetry = false,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.token,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Shopify GraphQL error ${response.status}: ${detail.slice(0, 500)}`,
      );
    }

    const json = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string; extensions?: { code?: string } }>;
    };

    if (json.errors?.length) {
      const throttled = json.errors.some(
        (e) => e.extensions?.code === 'THROTTLED',
      );
      if (throttled && !isRetry) {
        this.logger.warn(
          `Shopify GraphQL throttled, retrying after ${THROTTLE_RETRY_MS}ms`,
        );
        await this.delay(THROTTLE_RETRY_MS);
        return this.graphql<T>(query, variables, true);
      }
      throw new Error(
        `Shopify GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`,
      );
    }

    if (!json.data) {
      throw new Error('Shopify GraphQL response had no data');
    }

    return json.data;
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
