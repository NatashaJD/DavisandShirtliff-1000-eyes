/**
 * Realtime Broadcast Worker
 *
 * BullMQ Worker on the `realtime-broadcast` queue.
 * Publishes payloads to Redis Pub/Sub channels so all broadcaster instances
 * fan out to their connected WebSocket clients within the 3-second SLA.
 *
 * Job payload: BroadcastPayload { channel, event, data, sentAt }
 *
 * Requirements: 9.1, 7.7
 */

import { Worker, type Job } from 'bullmq';

import { realtimeBroadcaster } from '../services/realtime-broadcaster.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { BroadcastPayload } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

async function processBroadcast(job: Job<BroadcastPayload>): Promise<void> {
  const payload = job.data;

  logger.info(
    { jobId: job.id, channel: payload.channel, event: payload.event },
    '[broadcast.worker] Publishing to Redis Pub/Sub',
  );

  // Publish to the Redis Pub/Sub channel — all broadcaster instances receive it
  // and fan out to their connected clients (Req 9.1, 9.3)
  await realtimeBroadcaster.publish(payload.channel, payload);

  logger.info({ jobId: job.id, channel: payload.channel }, '[broadcast.worker] Published');
}

// ---------------------------------------------------------------------------
// Worker instance
// ---------------------------------------------------------------------------

const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as null };

export const broadcastWorker = new Worker<BroadcastPayload>(
  'realtime-broadcast',
  processBroadcast,
  {
    connection,
    concurrency: 20, // High concurrency — publish is non-blocking
  },
);

broadcastWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, '[broadcast.worker] Job completed');
});

broadcastWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, '[broadcast.worker] Job failed');
});
