import {
  Injectable,
  Logger,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PodLeadTimeResult,
  PodPriceComponent,
  PodPriceInput,
  PodPriceResult,
  PodProvider,
  PodStatusResult,
  PodSubmitInput,
  PodSubmitResult,
} from '../pod-provider.interface';

interface PictoremPodConfig {
  material: string;
  type: string;
  orientation?: string;
  width: number;
  height: number;
  additional?: string[];
}

const PICTOREM_STATUS_MAP: Record<number, PodStatusResult['status']> = {
  0: 'in_production', // Processing
  1: 'in_production', // In Production
  2: 'in_production', // Ready to Ship
  3: 'shipped',
  4: 'delivered',
  5: 'cancelled',
  9: 'pending', // Pending Payment
  11: 'in_production', // Back Order
};

interface PictoremOrderStatusResponse {
  status: boolean;
  msg: Record<string, unknown> | [];
  order?: {
    orderid: number;
    po: string;
    order_status: string;
    order_status_label: string;
    billing_status: string;
    tracking_number?: string;
    tracking_carrier?: string;
    total: number;
    delivery: Record<string, unknown>;
    lines: Array<{
      line_id: number;
      status: string;
      tracking?: string;
    }>;
  };
}

interface PictoremSendOrderResponse {
  status: boolean;
  msg: Record<string, unknown> | [];
  orderid: number | null;
}

interface PictoremValidateResponse {
  status: boolean;
  msg: Record<string, unknown> | [];
}

interface PictoremPriceResponse {
  status: boolean;
  msg: Record<string, unknown> | [];
  pdpreordercode?: string;
  worksheet?:
    | {
        price?: {
          list?: Record<string, number>;
          discount?: Record<string, number>;
          subTotal?: number;
          total?: number;
          taxes?: {
            taxPercentage?: number;
            taxGST?: number;
            taxPST?: number;
          };
        };
      }
    | [];
}

interface PictoremLeadTimeResponse {
  status: boolean;
  msg: Record<string, unknown> | [];
  data?: { productionLeadTime?: number };
}

/** Humanized labels for Pictorem worksheet component keys. */
const PICTOREM_COMPONENT_LABELS: Record<string, string> = {
  main: 'Impresión',
  frame: 'Marco',
  plexiglass: 'Plexiglass',
  plexiglas: 'Plexiglass',
  float: 'Marco flotante',
  floating: 'Marco flotante',
  wrap: 'Wrap',
};

@Injectable()
export class PictoremProvider implements PodProvider {
  readonly name = 'pictorem';
  private readonly logger = new Logger(PictoremProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly currency: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('PICTOREM_API_KEY') ?? '';
    this.baseUrl =
      this.configService.get<string>('PICTOREM_API_URL') ??
      'https://www.pictorem.com/artflow/0.1';
    // Pictorem's getprice response carries no currency field; reseller pricing
    // is quoted in USD by default. Override with PICTOREM_CURRENCY if needed.
    this.currency =
      this.configService.get<string>('PICTOREM_CURRENCY') ?? 'USD';
  }

  /** Build the pipe-delimited preordercode Pictorem expects. */
  buildPreorderCode(podConfig: PictoremPodConfig, numCopies: number): string {
    const {
      material,
      type,
      orientation = 'horizontal',
      width,
      height,
      additional = [],
    } = podConfig;

    const parts = [
      String(numCopies),
      material,
      type,
      orientation,
      String(width),
      String(height),
      ...additional,
    ];
    return parts.join('|');
  }

  /** Derive orientation from aspect ratio string ("4:3", "1:1", "9:16", etc.) */
  deriveOrientation(aspectRatio: string): string {
    const [w, h] = aspectRatio.split(':').map(Number);
    if (!w || !h) return 'horizontal';
    if (w === h) return 'square';
    return w > h ? 'horizontal' : 'vertical';
  }

  private async post<T>(
    path: string,
    fields: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}/${path}`;
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { artFlowKey: this.apiKey },
      body: form,
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Pictorem API error ${response.status} at ${path}`,
      );
    }

    const json = (await response.json()) as T;
    return json;
  }

  async validatePreorderCode(preorderCode: string): Promise<void> {
    const result = await this.post<PictoremValidateResponse>(
      'validatepreorder/',
      { preordercode: preorderCode },
    );
    if (!result.status) {
      const errors = this.extractErrors(result.msg);
      throw new ServiceUnavailableException(
        `Invalid preordercode "${preorderCode}": ${errors}`,
      );
    }
  }

  /** Quote the reseller price for a podConfig (no order is created). */
  async getPrice(input: PodPriceInput): Promise<PodPriceResult> {
    const config = input.podConfig as unknown as PictoremPodConfig;
    if (!config.orientation && input.aspectRatio) {
      config.orientation = this.deriveOrientation(input.aspectRatio);
    }
    const preorderCode = this.buildPreorderCode(config, input.quantity);

    const result = await this.post<PictoremPriceResponse>('getprice/', {
      preordercode: preorderCode,
    });

    const price =
      result.status && !Array.isArray(result.worksheet)
        ? result.worksheet?.price
        : undefined;

    if (!result.status || !price) {
      const errors = this.extractErrors(result.msg);
      throw new ServiceUnavailableException(
        `Pictorem getprice failed for "${preorderCode}": ${errors}`,
      );
    }

    // Build the per-line invoice breakdown from the worksheet. Pictorem keys
    // each priced component (main, frame, plexiglass, …) under list/discount.
    const listObj = price.list ?? {};
    const discountObj = price.discount ?? {};
    const components: PodPriceComponent[] = Object.keys(listObj).map((code) => {
      const lineList = Number(listObj[code]) || 0;
      const lineDiscount = Number(discountObj[code]) || 0;
      return {
        code,
        label: PICTOREM_COMPONENT_LABELS[code] ?? this.capitalize(code),
        list: lineList,
        discount: lineDiscount,
        net: lineList - lineDiscount,
      };
    });

    const list = components.reduce((sum, c) => sum + c.list, 0);
    const discount = components.reduce((sum, c) => sum + c.discount, 0);
    const subtotal = price.subTotal ?? list - discount;
    const taxPercentage = Number(price.taxes?.taxPercentage) || 0;
    const taxAmount =
      (Number(price.taxes?.taxGST) || 0) + (Number(price.taxes?.taxPST) || 0);
    const total = price.total ?? subtotal + taxAmount;

    return {
      list,
      discount,
      subtotal,
      taxPercentage,
      taxAmount,
      total,
      currency: this.currency,
      preorderCode,
      components,
      rawResponse: result,
    };
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  async getLeadTime(input: PodPriceInput): Promise<PodLeadTimeResult> {
    const config = input.podConfig as unknown as PictoremPodConfig;
    if (!config.orientation && input.aspectRatio) {
      config.orientation = this.deriveOrientation(input.aspectRatio);
    }
    const preorderCode = this.buildPreorderCode(config, input.quantity);

    const result = await this.post<PictoremLeadTimeResponse>('getleadtime/', {
      preordercode: preorderCode,
    });

    if (!result.status) {
      const errors = this.extractErrors(result.msg);
      throw new ServiceUnavailableException(
        `Pictorem getleadtime failed for "${preorderCode}": ${errors}`,
      );
    }

    const leadTime = result.data?.productionLeadTime ?? null;
    const label = leadTime != null ? `${leadTime} días hábiles` : null;

    return {
      leadTime,
      unit: 'business_days',
      label,
      preorderCode,
      rawResponse: result,
    };
  }

  async submitOrder(input: PodSubmitInput): Promise<PodSubmitResult> {
    const { podConfig, quantity, imageUrl, shippingAddress, po, aspectRatio } =
      input;

    if (!podConfig) {
      throw new ServiceUnavailableException(
        `OrderItem ${input.orderItemId} has no podConfig — cannot submit to Pictorem`,
      );
    }

    const config = podConfig as unknown as PictoremPodConfig;

    // Derive orientation from aspectRatio if not explicit in podConfig
    if (!config.orientation && aspectRatio) {
      config.orientation = this.deriveOrientation(aspectRatio);
    }

    const preorderCode = this.buildPreorderCode(config, quantity);

    // Validate before submitting (catches bad configs early)
    await this.validatePreorderCode(preorderCode);

    const addr = (shippingAddress ?? {}) as Record<string, string>;
    const filetype = input.filetype ?? this.guessFiletype(imageUrl);

    const fields: Record<string, string> = {
      po,
      'orderList[0][code]': preorderCode,
      'orderList[0][fileurl]': imageUrl,
      'orderList[0][filetype]': filetype,
      'deliveryInfo[firstname]': addr['first_name'] ?? addr['firstname'] ?? '',
      'deliveryInfo[lastname]': addr['last_name'] ?? addr['lastname'] ?? '',
      'deliveryInfo[company]': addr['company'] ?? '',
      'deliveryInfo[address1]': addr['address1'] ?? '',
      'deliveryInfo[address2]': addr['address2'] ?? '',
      'deliveryInfo[city]': addr['city'] ?? '',
      'deliveryInfo[province]': addr['province_code'] ?? addr['province'] ?? '',
      'deliveryInfo[country]': addr['country_code'] ?? addr['country'] ?? '',
      'deliveryInfo[cp]': addr['zip'] ?? addr['postal_code'] ?? '',
      'deliveryInfo[phone]': addr['phone'] ?? '',
    };

    this.logger.log(
      `Submitting to Pictorem: PO=${po} code=${preorderCode} url=${imageUrl}`,
    );

    const result = await this.post<PictoremSendOrderResponse>(
      'sendorder/',
      fields,
    );

    if (!result.status || !result.orderid) {
      const errors = this.extractErrors(result.msg);
      throw new ServiceUnavailableException(
        `Pictorem sendorder failed for PO ${po}: ${errors}`,
      );
    }

    return {
      podOrderId: String(result.orderid),
      podProvider: this.name,
      rawResponse: result,
    };
  }

  async getStatus(podOrderId: string, po?: string): Promise<PodStatusResult> {
    const lookupField: Record<string, string> =
      podOrderId !== '' ? { orderid: podOrderId } : { po: po ?? '' };

    const result = await this.post<PictoremOrderStatusResponse>(
      'getorderstatus/',
      lookupField,
    );

    if (!result.status || !result.order) {
      const errors = this.extractErrors(result.msg);
      // Pictorem returns status:false when the quote was deleted ("remove quote").
      // Treat this as a cancellation rather than a transient error so the item
      // transitions to 'cancelled' and the cron stops retrying.
      if (/not.?found/i.test(errors)) {
        this.logger.warn(
          `Pictorem order ${podOrderId} not found (likely removed) — treating as cancelled`,
        );
        return { podOrderId, status: 'cancelled', rawResponse: result };
      }
      throw new ServiceUnavailableException(
        `Pictorem getorderstatus failed for orderid=${podOrderId}: ${errors}`,
      );
    }

    const statusCode = parseInt(result.order.order_status, 10);
    const mappedStatus = PICTOREM_STATUS_MAP[statusCode] ?? 'in_production';
    const tracking = result.order.tracking_number;

    return {
      podOrderId: String(result.order.orderid),
      status: mappedStatus,
      trackingNumber: tracking ?? undefined,
      trackingCarrier: result.order.tracking_carrier ?? undefined,
      rawResponse: result,
    };
  }

  async testConnection(): Promise<{
    ok: boolean;
    apiUrl: string;
    message: string;
  }> {
    const testCode = '1|canvas|stretched|horizontal|10|8';
    try {
      await this.validatePreorderCode(testCode);
      return {
        ok: true,
        apiUrl: this.baseUrl,
        message: 'Connection successful',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, apiUrl: this.baseUrl, message };
    }
  }

  cancel(_podOrderId: string): Promise<void> {
    // Pictorem (ArtFlow 0.1) has no cancellation endpoint.
    // To cancel, open the Pictorem panel and use "remove quote" on the order.
    // The next status sync will detect the deletion and mark the item cancelled.
    return Promise.reject(
      new NotImplementedException(
        'Pictorem no cancela por API: elimina el presupuesto (remove quote) en su panel. ' +
          'El siguiente sync de estado lo detectará y marcará el item como cancelado.',
      ),
    );
  }

  private extractErrors(msg: unknown): string {
    if (!msg || (Array.isArray(msg) && msg.length === 0))
      return 'Unknown error';
    if (typeof msg === 'object' && !Array.isArray(msg)) {
      const m = msg as Record<string, unknown>;
      if (Array.isArray(m['error'])) return (m['error'] as string[]).join(', ');
    }
    return JSON.stringify(msg);
  }

  private guessFiletype(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('.png')) return 'png';
    if (lower.includes('.tif')) return 'tiff';
    return 'jpg';
  }
}
