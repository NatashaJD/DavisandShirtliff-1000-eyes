/**
 * Dayliff 1000 Eyes — API entry point
 *
 * Starts the Fastify API server, registers all BullMQ workers, wires up
 * scheduled snapshot jobs, and connects the realtime broadcaster.
 *
 * Requirements: 3.1, 8.2, 9.1, 10.3, 19.1
 */

import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { realtimeBroadcaster } from './services/realtime-broadcaster.service.js';
import { analyticsService } from './services/analytics.service.js';
import { analyticsQueue } from './queues/index.js';
import { SNAPSHOT_SCHEDULES } from './workers/analytics.worker.js';
import { SnapshotType } from '@dayliff/types';

// Import workers — side-effect: they start listening for jobs on import
import './workers/timeline.worker.js';
import './workers/sla.worker.js';
import './workers/alert.worker.js';
import './workers/broadcast.worker.js';
import './workers/analytics.worker.js';
import './workers/sync.worker.js';

const start = async () => {
  // ── 1. Connect realtime broadcaster to Redis ──────────────────────────────
  await realtimeBroadcaster.connect();
  logger.info('Realtime broadcaster connected');

  // ── 2. Start WebSocket server ────────────────────────────────────────────
  const wsPort = env.WS_PORT ?? 3001;
  realtimeBroadcaster.startWebSocketServer(wsPort);
  logger.info({ wsPort }, 'WebSocket server started');

  // ── 3. Register BullMQ repeatable snapshot jobs (Req 8.2) ─────────────────
  for (const schedule of SNAPSHOT_SCHEDULES) {
    await analyticsQueue.add(
      `snapshot-${schedule.type.toLowerCase()}`,
      { type: schedule.type },
      {
        repeat: { pattern: schedule.cron },
        jobId: `snapshot-${schedule.type.toLowerCase()}`,
      },
    );
    logger.info({ type: schedule.type, cron: schedule.cron }, 'Scheduled snapshot job registered');
  }

  // ── 4. Build and start Fastify ───────────────────────────────────────────
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info({ host: env.HOST, port: env.PORT }, 'API server started');
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }

  // ── 5. Graceful shutdown ─────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    await app.close();
    await realtimeBroadcaster.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

void start();
