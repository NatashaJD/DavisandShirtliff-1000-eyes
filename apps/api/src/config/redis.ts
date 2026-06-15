/**
 * Shared Redis / ioredis clients
 */

import IORedis from 'ioredis';

import { env } from './env.js';
import { logger } from './logger.js';

function createRedisClient(name: string): IORedis {
  const client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });

  client.on('connect', () => logger.info(`Redis [${name}] connected`));
  client.on('error', (err) => logger.error({ err }, `Redis [${name}] error`));

  return client;
}

/** General-purpose Redis client (cache, blocklist) */
export const redis = createRedisClient('main');

/** Dedicated subscriber client for Pub/Sub (cannot share with publisher) */
export const redisSub = createRedisClient('subscriber');
