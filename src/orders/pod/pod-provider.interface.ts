// Each provider interprets podConfig with its own shape; the common interface keeps it loose.
export type PodConfig = Record<string, unknown>;

export interface PodSubmitInput {
  orderItemId: string;
  orderId: string;
  imageUrl: string;
  filetype?: string; // jpg | png | tiff — defaults to jpg
  title: string;
  variantTitle?: string;
  quantity: number;
  podConfig?: PodConfig;
  shippingAddress?: Record<string, unknown>;
  customerEmail?: string;
  orderNumber: string;
  po: string; // unique PO reference for this item (e.g. "#1001-abc12345")
  aspectRatio?: string; // e.g. "4:3" — providers derive orientation from this when not in podConfig
}

export interface PodSubmitResult {
  podOrderId: string;
  podProvider: string;
  rawResponse: unknown;
}

export interface PodStatusResult {
  podOrderId: string;
  status: 'pending' | 'in_production' | 'shipped' | 'delivered' | 'cancelled';
  trackingNumber?: string;
  trackingUrl?: string;
  trackingCarrier?: string;
  rawResponse: unknown;
}

export interface PodProvider {
  readonly name: string;
  submitOrder(input: PodSubmitInput): Promise<PodSubmitResult>;
  getStatus(podOrderId: string, po?: string): Promise<PodStatusResult>;
  cancel(podOrderId: string): Promise<void>;
  testConnection(): Promise<{ ok: boolean; apiUrl: string; message: string }>;
}
