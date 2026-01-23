import { registerAs } from '@nestjs/config';

//Shopify API configuration

export default registerAs('shopify', () => ({
  shopName: process.env.SHOPIFY_SHOP_NAME || 'your-shop.myshopify.com',
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN || '',
  webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || '',
  apiVersion: process.env.SHOPIFY_API_VERSION || '2024-01',
}));
