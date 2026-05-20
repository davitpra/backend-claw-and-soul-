export interface PodSubmitInput {
  orderItemId: string;
  orderId: string;
  imageUrl: string;
  title: string;
  variantTitle?: string;
  quantity: number;
  shippingAddress?: Record<string, unknown>;
  customerEmail?: string;
  orderNumber: string;
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
  getStatus(podOrderId: string): Promise<PodStatusResult>;
  cancel(podOrderId: string): Promise<void>;
}
