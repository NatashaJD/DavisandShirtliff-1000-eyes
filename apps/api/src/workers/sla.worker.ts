/**
 * SLA Evaluate Worker
 *
 * BullMQ Worker that processes jobs from the `sla-evaluate` queue.
 *
 * Job payload: { eventId: string, requestId: string, journeyStage: string, stageEntryAt: string }
 *
 * Processing steps:
 *  1. Parse the job payload
 *  2. Retrieve the service request to confirm it exists and get current stage
 *  3. Call slaMonitorService.evaluate() with the stage entry timestamp and
 *     the current time as the evaluation time
 *  4. Log the result
 *
 * Requirements: 5.1
 */

import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { serviceRequests } from '../db/schema/service-requests.js';
import { slaMonitorService } from '../services/sla-monitor.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { JourneyStage } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Job payload type
// ---------------------------------------------------------------------------

export interface SLAEvaluateJobData {
  eventId: string;
  requestId: string;
  journeyStage: string;
  stageEntryAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Worker processor
// ---------------------------------------------------------------------------

async function processSLAEvaluate(job: Job<SLAEvaluateJobData>): Promise<void> {
  const { eventId, requestId, journeyStage, stageEntryAt } = job.data;

  logger.info(
    { jobId: job.id, eventId, requestId, journeyStage },
    '[sla.worker] Processing sla-evaluate job',
  );

  // Confirm the service request exists
  const [request] = await db
    .select({ id: serviceRequests.id, currentStage: serviceRequests.currentStage })
    .from(serviceRequests)
    .where(eq(serviceRequests.id, requestId))
    .limit(1);

  if (!request) {
    throw new Error(`[sla.worker] Service request not found: ${requestId}`);
  }

  const stageEntry = new Date(stageEntryAt);
  if (isNaN(stageEntry.getTime())) {
    throw new Error(`[sla.worker] Invalid stageEntryAt timestamp: ${stageEntryAt}`);
  }

  const evaluationTime = new Date();

  // Cast the journey stage string to the enum — validate it is a known value
  const stage = journeyStage as JourneyStage;
  if (!Object.values(JourneyStage).includes(stage)) {
    throw new Error(`[sla.worker] Unknown journey stage: ${journeyStage}`);
  }

  const result = await slaMonitorService.evaluate(requestId, stage, stageEntry, evaluationTime);

  logger.info(
    {
      jobId: job.id,
      eventId,
      requestId,
      journeyStage,
      elapsedHours: result.elapsedHours,
      percentUsed: result.percentUsed,
      breached: result.breached,
      alertGenerated: result.alertGenerated,
    },
    '[sla.worker] SLA evaluation complete',
  );
}

// ---------------------------------------------------------------------------
// Worker instance
// ---------------------------------------------------------------------------

const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as null };

export const slaWorker = new Worker<SLAEvaluateJobData>(
  'sla-evaluate',
  processSLAEvaluate,
  {
    connection,
    concurrency: 5,
    lockDuration: 15_000,
  },
);

slaWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, '[sla.worker] Job completed');
});

slaWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, '[sla.worker] Job failed');
});

slaWorker.on('stalled', (jobId) => {
  logger.warn({ jobId }, '[sla.worker] Job stalled');
});
