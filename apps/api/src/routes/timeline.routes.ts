/**
 * Timeline route plugin
 *
 * GET /timeline/:requestId — retrieve the ordered event timeline for a service request
 *
 * HTTP status codes:
 *   200 — Timeline returned (may be an empty array for a request with no events)
 *   401 — Missing or invalid JWT
 *   404 — Service request not found (Req 4.2)
 *   500 — Unexpected server error
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { authenticate } from '../middleware/auth.middleware.js';
import { timelineService, NotFoundError } from '../services/timeline.service.js';

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function timelineRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /timeline/:requestId
   *
   * Returns the complete, ordered timeline for the given service request.
   * Events are ordered by occurred_at ASC, tie-broken by event_id ASC (Req 4.3).
   * All enrichment fields are present in every entry; missing values are null (Req 4.1).
   *
   * Requirements: 4.1, 4.2, 4.3
   */
  app.get(
    '/timeline/:requestId',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { requestId } = request.params as { requestId: string };
      const { userId, role } = request.user!;

      try {
        const entries = await timelineService.getTimeline(requestId, userId, role);

        return reply.code(200).send({
          success: true,
          data: entries,
          meta: { total: entries.length },
          error: null,
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.code(404).send({
            success: false,
            data: null,
            meta: null,
            error: err.message,
          });
        }

        request.log.error({ err, requestId }, 'GET /timeline/:requestId — unexpected error');
        return reply.code(500).send({
          success: false,
          data: null,
          meta: null,
          error: 'Internal server error',
        });
      }
    },
  );
}
