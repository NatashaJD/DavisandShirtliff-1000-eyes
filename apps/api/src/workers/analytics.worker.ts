/**
 * Analytics Update Worker
 *
 * BullMQ Worker on the `analytics-update` queue.
 * Triggered after each event ingestion to keep TimescaleDB aggregates current.
 *
 * Job payload: { eventId: string, requestId: string }
 *
 * For efficiency, this worker refreshes snapshot data incrementally by
 * re-computing KPIs for the affected period and upserting into analytics_snapshots.
 *
 * Requirements: 3.1, 8.1
 */

import { Worker, type Job } from 'bullmq';
import { SnapshotType } from '@dayliff/types';

import { analyticsService } from '../services/analytics.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface AnalyticsUpdateJobData {
  eventId: string;
  requestId: string;
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

async function processAnalyticsUpdate(job: Job<AnalyticsUpdateJobData>): Promise<void> {
  const { eventId, requestId } = job.data;

  logger.info({ jobId: job.id, eventId, requestId }, '[analytics.worker] Updating analytics');

  // Generate a fresh daily snapshot for today
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setUTCHours(23, 59, 59, 999);

  await analyticsService.generateSnapshot(SnapshotType.Daily, dayStart, dayEnd);

  logger.info({ jobId: job.id }, '[analytics.worker] Analytics snapshot updated');
}

// ---------------------------------------------------------------------------
// Scheduled snapshot jobs (registered separately in app bootstrap)
// ---------------------------------------------------------------------------

export const SNAPSHOT_SCHEDULES = [
  { type: SnapshotType.Daily, cron: '0 0 * * *' },       // midnight UTC
  { type: SnapshotType.Weekly, cron: '0 0 * * 1' },      // Monday 00:00 UTC
  { type: SnapshotType.Monthly, cron: '0 0 1 * *' },     // 1st of month 00:00 UTC
  { type: SnapshotType.Quarterly, cron: '0 0 1 1,4,7,10 *' }, // 1st of quarter
];

// ---------------------------------------------------------------------------
// Worker instance
// ---------------------------------------------------------------------------

const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as null };

export const analyticsWorker = new Worker<AnalyticsUpdateJobData>(
  'analytics-update',
  processAnalyticsUpdate,
  {
    connection,
    concurrency: 3,
  },
);

analyticsWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, '[analytics.worker] Job completed');
});

analyticsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, '[analytics.worker] Job failed');
});
