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

export interface PodPriceInput {
  podConfig: PodConfig;
  quantity: number;
  aspectRatio?: string; // providers derive orientation from this when not in podConfig
}

export interface PodPriceComponent {
  code: string; // raw worksheet key: 'main' | 'frame' | 'plexiglass' | ...
  label: string; // humanized label for display
  list: number; // gross list price for this line
  discount: number; // discount amount applied to this line
  net: number; // list - discount
}

export interface PodPriceResult {
  list: number; // total catalog list price (sum of all components, before discount)
  discount: number; // total reseller discount amount
  subtotal: number; // reseller cost before taxes (list - discount)
  taxPercentage: number; // provider tax rate (e.g. 0.13 for 13% HST)
  taxAmount: number; // provider taxes (GST + PST)
  total: number; // total including provider taxes
  currency: string; // provider currency (Pictorem has no field — defaults to USD)
  preorderCode: string; // the code used to obtain the quote
  components: PodPriceComponent[]; // per-line invoice breakdown
  rawResponse: unknown;
}

export interface PodLeadTimeResult {
  leadTime: number | null; // days (numeric) if the provider returns it
  unit: string; // e.g. "business_days" | "days" (best-effort)
  label: string | null; // raw text label from the provider, if any
  preorderCode: string;
  rawResponse: unknown;
}

export interface PodProvider {
  readonly name: string;
  submitOrder(input: PodSubmitInput): Promise<PodSubmitResult>;
  getStatus(podOrderId: string, po?: string): Promise<PodStatusResult>;
  getPrice(input: PodPriceInput): Promise<PodPriceResult>;
  getLeadTime(input: PodPriceInput): Promise<PodLeadTimeResult>;
  cancel(podOrderId: string): Promise<void>;
  testConnection(): Promise<{ ok: boolean; apiUrl: string; message: string }>;
}
