import {
  Injectable,
  Logger,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
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

@Injectable()
export class PictoremProvider implements PodProvider {
  readonly name = 'pictorem';
  private readonly logger = new Logger(PictoremProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('PICTOREM_API_KEY') ?? '';
    this.baseUrl =
      this.configService.get<string>('PICTOREM_API_URL') ??
      'https://www.pictorem.com/artflow/0.1';
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancel(_podOrderId: string): Promise<void> {
    // Pictorem does not expose a cancellation endpoint in ArtFlow 0.1.
    // Cancellations must be handled manually by contacting Pictorem support.
    return Promise.reject(
      new NotImplementedException(
        'Pictorem does not support API cancellation. Contact support manually.',
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
