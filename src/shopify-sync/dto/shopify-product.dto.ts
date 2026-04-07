export interface ShopifyProductPayload {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  status: string; // 'active' | 'archived' | 'draft'
}

export interface ShopifyDeletePayload {
  id: number;
}

export interface ShopifySyncJobData {
  jobType: 'upsert' | 'delete';
  payload: ShopifyProductPayload | ShopifyDeletePayload;
}
