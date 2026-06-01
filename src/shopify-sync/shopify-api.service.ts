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
