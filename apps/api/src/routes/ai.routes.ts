/**
 * AI route plugin
 *
 * GET  /ai/predictions/:requestId — current risk assessment and delay prediction
 * POST /ai/copilot               — natural language operational query
 *
 * Requirements: 10.1, 10.2, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { aiEngineService, AIUnavailableError } from '../services/ai-engine.service.js';
import { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const copilotBodySchema = z.object({
  query: z.string().min(1, 'Query is required').max(2000),
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

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const adminOrManager = [UserRole.Administrator, UserRole.RegionalManager];

  /**
   * GET /ai/predictions/:requestId
   * Requirements: 10.1, 10.2, 10.6
   */
  app.get(
    '/ai/predictions/:requestId',
    { preHandler: [authenticate, requireRole(adminOrManager)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { requestId } = request.params as { requestId: string };
      const userRole = request.user!.role;

      try {
        const assessment = await aiEngineService.getRiskAssessment(requestId, userRole);
        return reply.code(200).send({ success: true, data: assessment, meta: null, error: null });
      } catch (err) {
        if (err instanceof AIUnavailableError) {
          return sendError(reply, 503, err.message);
        }
        request.log.error({ err, requestId }, 'GET /ai/predictions/:requestId error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * POST /ai/copilot
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
   */
  app.post(
    '/ai/copilot',
    { preHandler: [authenticate, requireRole(adminOrManager)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = copilotBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 422, parsed.error.errors.map((e) => e.message).join('; '));
      }

      const { query } = parsed.data;
      const { userId, role } = request.user!;

      // 10-second timeout (Req 11.5)
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new AIUnavailableError('Copilot response timed out')), 10_000),
      );

      try {
        const response = await Promise.race([
          aiEngineService.copilotQuery(query, userId, role),
          timeout,
        ]);

        return reply.code(200).send({ success: true, data: response, meta: null, error: null });
      } catch (err) {
        if (err instanceof AIUnavailableError) {
          return sendError(reply, 503, err.message); // Req 11.6
        }
        request.log.error({ err }, 'POST /ai/copilot error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );
}
