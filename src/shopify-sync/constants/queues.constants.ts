export const SHOPIFY_SYNC_QUEUE = 'shopify-sync';

export const SHOPIFY_SYNC_JOB_NAMES = {
  UPSERT: 'upsert',
  DELETE: 'delete',
} as const;

export const SHOPIFY_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: true,
  removeOnFail: false,
} as const;

export const REDIS_CLIENT = 'SHOPIFY_SYNC_REDIS_CLIENT';
