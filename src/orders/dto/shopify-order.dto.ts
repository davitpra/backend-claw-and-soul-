export interface ShopifyMoneyAmount {
  amount: string;
  currency_code: string;
}

export interface ShopifyAddress {
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
  phone?: string;
}

export interface ShopifyLineItemProperty {
  name: string;
  value: string;
}

export interface ShopifyLineItem {
  id: number;
  product_id?: number;
  variant_id?: number;
  title: string;
  variant_title?: string;
  sku?: string;
  quantity: number;
  price: string;
  total_discount: string;
  properties: ShopifyLineItemProperty[];
}

export interface ShopifyCustomer {
  id?: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export interface ShopifyOrderPayload {
  id: number;
  admin_graphql_api_id?: string;
  name: string; // e.g. "#1042"
  email?: string;
  phone?: string;
  currency: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  subtotal_price: string;
  total_shipping_price_set?: { shop_money: ShopifyMoneyAmount };
  total_tax: string;
  total_price: string;
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  note?: string;
  created_at: string;
  updated_at: string;
  cancelled_at?: string | null;
  customer?: ShopifyCustomer;
  line_items: ShopifyLineItem[];
}
