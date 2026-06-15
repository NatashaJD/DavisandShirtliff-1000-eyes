/**
 * Fastify application factory
 *
 * Registers all route plugins and wires the circuit breaker for AI/ML calls.
 * Requirements: all
 */

import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { env } from './config/env.js';
import { authRoutes } from './routes/auth.routes.js';
import { requestRoutes } from './routes/requests.routes.js';
import { eventRoutes } from './routes/events.routes.js';
import { timelineRoutes } from './routes/timeline.routes.js';
import { slaRoutes } from './routes/sla.routes.js';
import { alertRoutes } from './routes/alerts.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { adminRoutes } from './routes/admin.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MB — Requirement 12.1
  });

  // ── Security ──────────────────────────────────────────────────────────────
  await app.register(fastifyHelmet);

  await app.register(fastifyCors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  await app.register(fastifyRateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ── Authentication ────────────────────────────────────────────────────────
  await app.register(authRoutes);

  // ── Core domain routes ────────────────────────────────────────────────────
  await app.register(requestRoutes);       // POST/GET/PATCH /requests
  await app.register(eventRoutes);         // POST/GET /events
  await app.register(timelineRoutes);      // GET /timeline/:requestId
  await app.register(slaRoutes);           // GET/PUT /sla/*
  await app.register(alertRoutes);         // GET/PATCH /alerts
  await app.register(analyticsRoutes);     // GET /analytics/*
  await app.register(dashboardRoutes);     // GET /dashboard/*
  await app.register(aiRoutes);            // GET /ai/predictions, POST /ai/copilot
  await app.register(adminRoutes);         // POST /admin/archive

  return app;
}
