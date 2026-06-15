/**
 * SLA route plugin
 *
 * GET  /sla/compliance       — compliance rate by department and stage
 * GET  /sla/rules            — list all SLA rules
 * PUT  /sla/rules/:stage     — update threshold for a stage (Administrator only)
 *
 * Requirements: 5.4, 5.5, 5.7
 */

import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db/client.js';
import { slaRules } from '../db/schema/sla-rules.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize, Permission } from '../middleware/rbac.middleware.js';
import { slaMonitorService, UpdateRulesSchema } from '../services/sla-monitor.service.js';
import { JourneyStage } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Query params for GET /sla/compliance */
const ComplianceQuerySchema = z.object({
  from: z.string().datetime({ message: 'from must be an ISO 8601 date' }),
  to: z.string().datetime({ message: 'to must be an ISO 8601 date' }),
});

/** Valid journey stage values (non-terminal only, but we allow querying any) */
const VALID_STAGES = Object.values(JourneyStage);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendError(reply: FastifyReply, statusCode: number, message: string): FastifyReply {
  return reply.code(statusCode).send({
    success: false,
    data: null,
    meta: null,
    error: message,
  });
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function slaRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /sla/compliance
   * Returns SLA compliance rate per department and per journey stage
   * for the requested time period.
   *
   * Permissions: Regional Manager, Administrator (ViewAnalyticsDashboard)
   * Query params:
   *   - from (ISO 8601) — start of period (inclusive)
   *   - to   (ISO 8601) — end of period (inclusive)
   * Period must be 1–365 calendar days inclusive.
   *
   * Returns 100% compliance with zero records when no data exists (Req 5.7).
   *
   * Requirements: 5.4, 5.7
   */
  app.get(
    '/sla/compliance',
    {
      preHandler: [authenticate, authorize(Permission.ViewAnalyticsDashboard)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string>;

      // Validate query params
      const parseResult = ComplianceQuerySchema.safeParse({
        from: query.from,
        to: query.to,
      });

      if (!parseResult.success) {
        return sendError(
          reply,
          422,
          parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        );
      }

      const from = new Date(parseResult.data.from);
      const to = new Date(parseResult.data.to);

      if (from >= to) {
        return sendError(reply, 422, 'from must be before to');
      }

      // Validate 1–365 days inclusive
      const diffMs = to.getTime() - from.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays < 1) {
        return sendError(reply, 422, 'Period must be at least 1 calendar day');
      }
      if (diffDays > 365) {
        return sendError(reply, 422, 'Period must not exceed 365 calendar days');
      }

      try {
        const metrics = await slaMonitorService.getComplianceMetrics(from, to);

        // Req 5.7 — if no data, return 100% with zero records
        const hasData =
          Object.keys(metrics.byDepartment).length > 0 ||
          Object.keys(metrics.byStage).length > 0;

        return reply.code(200).send({
          success: true,
          data: {
            byDepartment: hasData ? metrics.byDepartment : {},
            byStage: hasData ? metrics.byStage : {},
            overallComplianceRate: 1.0,
            recordsProcessed: 0,
            ...(hasData
              ? {
                  overallComplianceRate: computeOverallRate(metrics),
                  recordsProcessed: Object.values(metrics.byDepartment).length,
                }
              : {}),
          },
          meta: {
            from: from.toISOString(),
            to: to.toISOString(),
          },
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'GET /sla/compliance error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * GET /sla/rules
   * Returns all configured SLA rules.
   * Permissions: All authenticated roles
   *
   * Requirements: 5.4
   */
  app.get(
    '/sla/rules',
    {
      preHandler: [authenticate, authorize(Permission.ViewDeptRequests)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const rules = await db.select().from(slaRules).orderBy(slaRules.journeyStage);

        return reply.code(200).send({
          success: true,
          data: rules,
          meta: null,
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'GET /sla/rules error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * PUT /sla/rules/:stage
   * Update the SLA threshold for a given journey stage.
   * Applies immediately to all non-terminal active requests (Req 5.5).
   *
   * Permissions: Administrator only (ManageSLARules)
   * Body: { thresholdHours: number }
   *
   * Requirements: 5.5
   */
  app.put(
    '/sla/rules/:stage',
    {
      preHandler: [authenticate, authorize(Permission.ManageSLARules)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { stage } = request.params as { stage: string };

      // Validate stage is a known JourneyStage
      if (!VALID_STAGES.includes(stage as JourneyStage)) {
        return sendError(
          reply,
          422,
          `Invalid journey stage: "${stage}". Valid stages: ${VALID_STAGES.join(', ')}`,
        );
      }

      const parseResult = UpdateRulesSchema.safeParse(request.body);
      if (!parseResult.success) {
        return sendError(
          reply,
          422,
          parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        );
      }

      const { thresholdHours } = parseResult.data;

      try {
        await slaMonitorService.updateRules(stage as JourneyStage, thresholdHours);

        // Return the updated rule
        const [updated] = await db
          .select()
          .from(slaRules)
          .where(slaRules.journeyStage.eq ? 
            // drizzle typed eq
            (slaRules.journeyStage as unknown as { eq: (v: string) => unknown }).eq(stage) :
            // fallback (not normally used)
            slaRules.journeyStage
          )
          .limit(1);

        return reply.code(200).send({
          success: true,
          data: updated ?? { journeyStage: stage, thresholdHours },
          meta: null,
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'PUT /sla/rules/:stage error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Computes the mean compliance rate across all departments.
 */
function computeOverallRate(metrics: { byDepartment: Record<string, number> }): number {
  const rates = Object.values(metrics.byDepartment);
  if (rates.length === 0) return 1.0;
  return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}
