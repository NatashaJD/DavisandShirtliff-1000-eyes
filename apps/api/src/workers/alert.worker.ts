/**
 * Alert Generate Worker
 *
 * BullMQ Worker on the `alert-generate` queue.
 * Creates alerts when triggered by the event pipeline (SLA breaches, critical delays, etc.)
 *
 * Job payload: {
 *   requestId: string,
 *   alertType: AlertType,
 *   severity: AlertSeverity,
 *   message: string,
 *   metadata?: Record<string, unknown>
 * }
 *
 * After creating the alert, publishes to the realtime broadcaster.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import { Worker, type Job } from 'bullmq';

import { alertService } from '../services/alert.service.js';
import { broadcastQueue } from '../queues/index.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { AlertType, AlertSeverity } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface AlertGenerateJobData {
  requestId?: string | null;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

async function processAlertGenerate(job: Job<AlertGenerateJobData>): Promise<void> {
  const { requestId, alertType, severity, message, metadata } = job.data;

  logger.info({ jobId: job.id, alertType, severity }, '[alert.worker] Creating alert');

  // 1. Create the alert in DB with lifecycle state = Created (Req 6.3)
  const alert = await alertService.createAlert({
    requestId: requestId ?? null,
    alertType,
    severity,
    message,
    metadata: metadata ?? null,
  });

  // 2. Enqueue a realtime broadcast job for the new alert (Req 6.3)
  await broadcastQueue.add('broadcast-alert', {
    channel: `alert:${severity}`,
    event: 'alert_created',
    data: {
      alertId: alert.id,
      requestId: alert.requestId,
      alertType: alert.alertType,
      severity: alert.severity,
      lifecycleState: alert.lifecycleState,
      message: alert.message,
      createdAt: alert.createdAt,
    },
    sentAt: new Date().toISOString(),
  });

  logger.info({ jobId: job.id, alertId: alert.id }, '[alert.worker] Alert created and broadcast enqueued');
}

// ---------------------------------------------------------------------------
// Worker instance
// ---------------------------------------------------------------------------

const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as null };

export const alertWorker = new Worker<AlertGenerateJobData>(
  'alert-generate',
  processAlertGenerate,
  {
    connection,
    concurrency: 10,
  },
);

alertWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, '[alert.worker] Job completed');
});

alertWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, '[alert.worker] Job failed');
});
