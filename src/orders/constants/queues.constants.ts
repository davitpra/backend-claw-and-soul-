export const ORDERS_QUEUE = 'orders-sync';

export const ORDERS_JOB_NAMES = {
  INGEST: 'ingest',
} as const;

export const ORDERS_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: true,
  removeOnFail: false,
} as const;

export const ORDERS_REDIS_CLIENT = 'ORDERS_REDIS_CLIENT';
