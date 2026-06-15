/**
 * Admin route plugin
 *
 * POST /admin/archive — initiate data archival (Administrator only)
 *
 * Requirements: 13.2, 13.3
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { auditService } from '../services/audit.service.js';
import { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const archiveBodySchema = z.object({
  cutoffDate: z.string().datetime({ message: 'cutoffDate must be an ISO datetime string' }),
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

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /admin/archive
   * Body: { cutoffDate: ISO datetime }
   * Requirements: 13.2, 13.3
   */
  app.post(
    '/admin/archive',
    { preHandler: [authenticate, requireRole([UserRole.Administrator])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = archiveBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 422, parsed.error.errors.map((e) => e.message).join('; '));
      }

      const cutoffDate = new Date(parsed.data.cutoffDate);

      try {
        const result = await auditService.archiveOlderThan(cutoffDate);
        return reply.code(200).send({
          success: true,
          data: result,
          meta: null,
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'POST /admin/archive error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );
}
