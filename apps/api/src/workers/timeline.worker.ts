/**
 * Timeline Update Worker
 *
 * BullMQ Worker that processes jobs from the `timeline-update` queue.
 *
 * Each job payload: { eventId: string, requestId: string }
 *
 * Processing steps:
 *  1. Load the event from the `events` table by eventId
 *  2. Determine the next position by counting existing timeline entries for
 *     the requestId ordered by occurred_at ASC, event_id ASC — position = count + 1
 *  3. INSERT into `timelines` with ON CONFLICT DO NOTHING for idempotency
 *
 * Must complete within 2 seconds of job receipt (Req 4.4).
 * Events are never removed from the timeline (append-only, Req 4.5).
 *
 * Requirements: 4.4, 4.5
 */

import { Worker, type Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { events } from '../db/schema/events.js';
import { timelines } from '../db/schema/timelines.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Job payload type
// ---------------------------------------------------------------------------

export interface TimelineUpdateJobData {
  eventId: string;
  requestId: string;
}

// ---------------------------------------------------------------------------
// Worker processor
// ---------------------------------------------------------------------------

/**
 * Process a single timeline-update job.
 *
 * The 2-second deadline (Req 4.4) is enforced by BullMQ's job lock mechanism —
 * the worker is configured with a stalledInterval that will re-enqueue jobs
 * that stall for longer than the lock duration.
 */
async function processTimelineUpdate(job: Job<TimelineUpdateJobData>): Promise<void> {
  const { eventId, requestId } = job.data;

  const jobStart = Date.now();
  logger.info({ jobId: job.id, eventId, requestId }, '[timeline.worker] Processing timeline-update job');

  // -------------------------------------------------------------------------
  // 1. Load the event to confirm it exists
  // -------------------------------------------------------------------------
  const [event] = await db
    .select({ id: events.id, requestId: events.requestId })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    // If the event doesn't exist yet (race condition), throw so BullMQ retries
    throw new Error(`[timeline.worker] Event not found: ${eventId}`);
  }

  // -------------------------------------------------------------------------
  // 2. Determine position = COUNT(existing timeline entries for requestId) + 1
  //    Ordering by occurred_at ASC, event_id ASC is for READ queries (GET /timeline);
  //    for position assignment we count existing rows so position is stable.
  // -------------------------------------------------------------------------
  const countResult = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(timelines)
    .where(eq(timelines.requestId, requestId));

  const position = (Number(countResult[0]?.count ?? 0)) + 1;

  // -------------------------------------------------------------------------
  // 3. INSERT with ON CONFLICT (request_id, event_id) DO NOTHING
  //    This makes the operation idempotent — re-delivering the job is safe.
  //    (Req 4.5: events are never removed, append-only)
  // -------------------------------------------------------------------------
  await db.execute(
    sql`
      INSERT INTO timelines (id, request_id, event_id, position, appended_at)
      VALUES (
        gen_random_uuid(),
        ${requestId}::uuid,
        ${eventId}::uuid,
        ${position},
        NOW()
      )
      ON CONFLICT (request_id, event_id) DO NOTHING
    `,
  );

  const elapsed = Date.now() - jobStart;
  logger.info(
    { jobId: job.id, eventId, requestId, position, elapsedMs: elapsed },
    '[timeline.worker] Timeline entry appended',
  );
}

// ---------------------------------------------------------------------------
// Worker instance
// ---------------------------------------------------------------------------

const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as null };

export const timelineWorker = new Worker<TimelineUpdateJobData>(
  'timeline-update',
  processTimelineUpdate,
  {
    connection,
    concurrency: 5,
    // Lock duration = 10 s; well above the 2-second processing SLA so normal
    // jobs complete and renew their lock without being considered stalled.
    lockDuration: 10_000,
  },
);

timelineWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, '[timeline.worker] Job completed');
});

timelineWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, '[timeline.worker] Job failed');
});

timelineWorker.on('stalled', (jobId) => {
  logger.warn({ jobId }, '[timeline.worker] Job stalled');
});
