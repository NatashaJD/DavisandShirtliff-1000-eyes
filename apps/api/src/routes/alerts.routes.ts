/**
 * Alerts route plugin
 *
 * PATCH /alerts/:id  — acknowledge or resolve an alert
 * GET   /alerts      — paginated, filtered list of alerts
 *
 * Requirements: 6.4, 6.5, 6.6, 6.7, 6.8
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/auth.middleware.js';
import {
  alertService,
  AlertConflictError,
  AlertForbiddenError,
  AlertNotFoundError,
} from '../services/alert.service.js';
import { AlertLifecycleState, AlertSeverity, AlertType } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const patchAlertBodySchema = z.object({
  action: z.enum(['acknowledge', 'resolve', 'archive']),
});

const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  severity: z.nativeEnum(AlertSeverity).optional(),
  alertType: z.nativeEnum(AlertType).optional(),
  lifecycleState: z.nativeEnum(AlertLifecycleState).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendError(reply: FastifyReply, code: number, message: string) {
  return reply.code(code).send({ success: false, data: null, meta: null, error: message });
}

const ACTION_TO_STATE: Record<string, AlertLifecycleState> = {
  acknowledge: AlertLifecycleState.Acknowledged,
  resolve: AlertLifecycleState.Resolved,
  archive: AlertLifecycleState.Archived,
};

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function alertRoutes(app: FastifyInstance): Promise<void> {
  /**
   * PATCH /alerts/:id
   * Body: { action: 'acknowledge' | 'resolve' | 'archive' }
   * Requirements: 6.4, 6.5, 6.6, 6.7
   */
  app.patch(
    '/alerts/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.userId;

      const parsed = patchAlertBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 422, parsed.error.errors.map((e) => e.message).join('; '));
      }

      const targetState = ACTION_TO_STATE[parsed.data.action];

      try {
        const updated = await alertService.transitionAlert(id, targetState, userId);
        return reply.code(200).send({ success: true, data: updated, meta: null, error: null });
      } catch (err) {
        if (err instanceof AlertNotFoundError) return sendError(reply, 404, err.message);
        if (err instanceof AlertConflictError) return sendError(reply, 409, err.message);
        if (err instanceof AlertForbiddenError) return sendError(reply, 403, err.message);
        request.log.error({ err, alertId: id }, 'PATCH /alerts/:id error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * GET /alerts
   * Requirements: 6.8
   */
  app.get(
    '/alerts',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = listAlertsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(reply, 422, parsed.error.errors.map((e) => e.message).join('; '));
      }

      const { page, pageSize, severity, alertType, lifecycleState, from, to } = parsed.data;

      try {
        const { data, total } = await alertService.listAlerts(
          {
            severity,
            alertType,
            lifecycleState,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
            page,
            pageSize,
          },
          request.user!.role,
        );

        return reply.code(200).send({
          success: true,
          data,
          meta: { page, pageSize, total },
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'GET /alerts error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );
}
