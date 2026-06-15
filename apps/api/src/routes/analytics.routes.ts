/**
 * Analytics route plugin
 *
 * GET /analytics/trends     — request volume + SLA compliance trend data
 * GET /analytics/departments — per-department efficiency metrics
 * GET /analytics/reports    — list persisted analytics snapshots
 *
 * Requirements: 8.3, 8.4, 8.6, 8.7
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { analyticsService, AnalyticsRangeError } from '../services/analytics.service.js';
import { db } from '../db/client.js';
import { analyticsSnapshots } from '../db/schema/analytics-snapshots.js';
import { desc } from 'drizzle-orm';
import { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const trendsQuerySchema = z.object({
  from: z.string().datetime({ message: 'from must be an ISO datetime' }),
  to: z.string().datetime({ message: 'to must be an ISO datetime' }),
});

const deptQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const reportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function sendError(reply: FastifyReply, code: number, message: string) {
  return reply.code(code).send({ success: false, data: null, meta: null, error: message });
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  const adminOrManager = [UserRole.Administrator, UserRole.RegionalManager];

  /**
   * GET /analytics/trends
   * Requirements: 8.3, 8.6, 8.7
   */
  app.get(
    '/analytics/trends',
    { preHandler: [authenticate, requireRole(adminOrManager)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = trendsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(reply, 422, parsed.error.errors.map((e) => e.message).join('; '));
      }

      const from = new Date(parsed.data.from);
      const to = new Date(parsed.data.to);

      try {
        const trends = await analyticsService.getTrends(from, to);
        return reply.code(200).send({ success: true, data: trends, meta: null, error: null });
      } catch (err) {
        if (err instanceof AnalyticsRangeError) return sendError(reply, 422, err.message);
        request.log.error({ err }, 'GET /analytics/trends error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * GET /analytics/departments
   * Requirements: 8.4
   */
  app.get(
    '/analytics/departments',
    { preHandler: [authenticate, requireRole(adminOrManager)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = deptQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(reply, 422, parsed.error.errors.map((e) => e.message).join('; '));
      }

      const from = parsed.data.from ? new Date(parsed.data.from) : new Date(Date.now() - 30 * 86_400_000);
      const to = parsed.data.to ? new Date(parsed.data.to) : new Date();

      try {
        const metrics = await analyticsService.getDepartmentEfficiency(from, to);
        return reply.code(200).send({ success: true, data: metrics, meta: null, error: null });
      } catch (err) {
        request.log.error({ err }, 'GET /analytics/departments error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * GET /analytics/reports
   * Requirements: 8.2, 8.5
   */
  app.get(
    '/analytics/reports',
    { preHandler: [authenticate, requireRole(adminOrManager)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = reportsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(reply, 422, parsed.error.errors.map((e) => e.message).join('; '));
      }

      const { page, pageSize } = parsed.data;
      const offset = (page - 1) * pageSize;

      try {
        const rows = await db
          .select()
          .from(analyticsSnapshots)
          .orderBy(desc(analyticsSnapshots.periodStart))
          .limit(pageSize)
          .offset(offset);

        const countRows = await db.select({ id: analyticsSnapshots.id }).from(analyticsSnapshots);

        return reply.code(200).send({
          success: true,
          data: rows,
          meta: { page, pageSize, total: countRows.length },
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'GET /analytics/reports error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );
}
