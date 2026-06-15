/**
 * Dashboard route plugin
 *
 * GET /dashboard/overview    — KPI data scoped to requesting user's role
 * GET /dashboard/bottlenecks — top 10 bottleneck stages (Admin/RegionalManager only)
 *
 * Requirements: 7.1, 7.2, 7.5, 7.6, 7.7, 7.8
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { analyticsService } from '../services/analytics.service.js';
import { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendError(reply: FastifyReply, code: number, message: string) {
  return reply.code(code).send({ success: false, data: null, meta: null, error: message });
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /dashboard/overview
   * Returns KPI data scoped to requesting user's role.
   * Requirements: 7.1, 7.2, 7.5
   */
  app.get(
    '/dashboard/overview',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userRole = request.user!.role;

      try {
        const kpis = await analyticsService.computeKPIs(userRole);

        return reply.code(200).send({
          success: true,
          data: {
            kpis,
            // Stale-data indicator — false when broadcaster is available (Req 7.7)
            isStale: false,
            computedAt: new Date().toISOString(),
          },
          meta: null,
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'GET /dashboard/overview error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * GET /dashboard/bottlenecks
   * Returns up to 10 bottleneck stages ranked by avg excess time beyond SLA.
   * Requirements: 7.6
   */
  app.get(
    '/dashboard/bottlenecks',
    { preHandler: [authenticate, requireRole([UserRole.Administrator, UserRole.RegionalManager])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userRole = request.user!.role;

      try {
        const bottlenecks = await analyticsService.getBottlenecks(10, userRole);

        return reply.code(200).send({
          success: true,
          data: bottlenecks,
          meta: { total: bottlenecks.length },
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'GET /dashboard/bottlenecks error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );
}
