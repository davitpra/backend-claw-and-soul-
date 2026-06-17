export interface ShopifyVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export interface ShopifyProductPayload {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  status: string; // 'active' | 'archived' | 'draft'
  variants: ShopifyVariant[];
}

export interface ShopifyDeletePayload {
  id: number;
}

export interface ShopifySyncJobData {
  jobType: 'upsert' | 'delete';
  payload: ShopifyProductPayload | ShopifyDeletePayload;
}
