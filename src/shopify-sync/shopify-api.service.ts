import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopifyProductPayload } from './dto/shopify-product.dto';

const WEBHOOK_TOPICS = ['products/create', 'products/update', 'products/delete'];
const PAGE_SIZE = 250;
const PAGE_DELAY_MS = 500;

@Injectable()
export class ShopifyApiService {
  private readonly logger = new Logger(ShopifyApiService.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('SHOPIFY_ADMIN_API_URL') ?? '';
    this.token = this.configService.get<string>('SHOPIFY_ADMIN_API_TOKEN') ?? '';
  }

  async fetchAllProducts(): Promise<ShopifyProductPayload[]> {
    const all: ShopifyProductPayload[] = [];
    let nextUrl: string | null =
      `${this.baseUrl}/products.json?limit=${PAGE_SIZE}`;

    while (nextUrl) {
      const response = await this.fetchWithRetry(nextUrl);
      const json = (await response.json()) as { products: ShopifyProductPayload[] };
      all.push(...json.products);

      nextUrl = this.extractNextPageUrl(response.headers.get('link'));

      if (nextUrl) {
        await this.delay(PAGE_DELAY_MS);
      }
    }

    this.logger.log(`Fetched ${all.length} products from Shopify`);
    return all;
  }

  async registerWebhooks(appPublicUrl: string): Promise<void> {
    for (const topic of WEBHOOK_TOPICS) {
      const topicSlug = topic.replace('/', '-').replace('products-', 'product/');
      const address = `${appPublicUrl}/api/webhooks/shopify/${topicSlug}`;

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
          this.logger.log(`Registered webhook for topic: ${topic} → ${address}`);
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
