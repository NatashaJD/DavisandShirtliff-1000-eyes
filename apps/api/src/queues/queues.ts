/**
 * BullMQ Queue instances for the event processing pipeline
 *
 * Each queue is backed by the shared Redis connection.
 * Queues are created once and exported as singletons.
 *
 * Requirements: 3.1, 3.8
 */

import { Queue } from 'bullmq';
import { env } from '../config/env.js';

// BullMQ requires `maxRetriesPerRequest: null` on the Redis connection
const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as null };

/** Append event to the timeline for the associated service request */
export const timelineQueue = new Queue('timeline-update', { connection });

/** Evaluate SLA compliance for the associated service request stage */
export const slaQueue = new Queue('sla-evaluate', { connection });

/** Generate alerts if SLA thresholds are crossed */
export const alertQueue = new Queue('alert-generate', { connection });

/** Publish event update to Redis Pub/Sub for WebSocket fan-out */
export const broadcastQueue = new Queue('realtime-broadcast', { connection });

/** Update TimescaleDB analytics aggregates with this event's data */
export const analyticsQueue = new Queue('analytics-update', { connection });
