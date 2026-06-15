/**
 * SLAMonitorService — Real-time SLA compliance evaluation and breach detection
 *
 * Evaluates stage durations against SLA_Rule thresholds, generates
 * Warning (≥80%) and Critical (≥100%) alerts with deduplication, and
 * records breach flags on service_requests.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.7
 */

import { and, eq, ne, gte, lte, sql, isNotNull, not, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db/client.js';
import { slaRules, type SLARule } from '../db/schema/sla-rules.js';
import { alerts, type NewAlert } from '../db/schema/alerts.js';
import { serviceRequests } from '../db/schema/service-requests.js';
import { logger } from '../config/logger.js';
import { JourneyStage, AlertSeverity, AlertType, TERMINAL_STAGES } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SLAEvaluationResult {
  /** Elapsed hours since stage entry */
  elapsedHours: number;
  /** SLA threshold in hours for the stage (0 if no rule exists) */
  thresholdHours: number;
  /** Ratio of elapsed to threshold (0–1+) */
  percentUsed: number;
  /** True when elapsedHours ≥ thresholdHours */
  breached: boolean;
  /** Severity of alert generated, or null if none was generated */
  alertGenerated: AlertSeverity | null;
}

export interface ComplianceMetrics {
  byDepartment: Record<string, number>;
  byStage: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Zod validation for public inputs
// ---------------------------------------------------------------------------

export const UpdateRulesSchema = z.object({
  thresholdHours: z.number().positive(),
});

export type UpdateRulesInput = z.infer<typeof UpdateRulesSchema>;

// ---------------------------------------------------------------------------
// SLAMonitorService
// ---------------------------------------------------------------------------

export class SLAMonitorService {
  /**
   * Evaluate the elapsed duration of a request's active journey stage
   * against the SLA rule for that stage.
   *
   * Deduplication: Before generating a Warning or Critical alert the service
   * checks for an existing non-Archived alert of the same
   * (request_id, journey_stage, severity). A new alert is only inserted when
   * no such duplicate exists.
   *
   * If no SLA rule exists for the stage:
   *  - Logs an Info-severity alert
   *  - Returns alertGenerated: null and percentUsed: 0
   *  - Does NOT generate a breach score (Req 5.6)
   *
   * Requirements: 5.1, 5.2, 5.3, 5.6
   */
  async evaluate(
    requestId: string,
    journeyStage: JourneyStage,
    stageEntryAt: Date,
    evaluationTime: Date,
  ): Promise<SLAEvaluationResult> {
    const elapsedMs = evaluationTime.getTime() - stageEntryAt.getTime();
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    // ------------------------------------------------------------------
    // Fetch SLA rule for this stage
    // ------------------------------------------------------------------
    const rule = await this.getRule(journeyStage);

    if (!rule) {
      // Req 5.6 — no rule: log Info alert, return without breach score
      logger.info(
        { requestId, journeyStage },
        '[sla-monitor] No SLA rule found for stage; logging Info alert',
      );

      const alreadyInfoed = await this.hasActiveAlert(requestId, journeyStage, AlertSeverity.Info);
      if (!alreadyInfoed) {
        await db.insert(alerts).values({
          requestId,
          alertType: AlertType.Operational,
          severity: AlertSeverity.Info,
          lifecycleState: 'Created',
          message: `No SLA rule defined for journey stage "${journeyStage}" on request ${requestId}.`,
          metadata: { journeyStage, requestId },
        } satisfies NewAlert);
      }

      return {
        elapsedHours,
        thresholdHours: 0,
        percentUsed: 0,
        breached: false,
        alertGenerated: null,
      };
    }

    const thresholdHours = Number(rule.thresholdHours);
    const percentUsed = thresholdHours > 0 ? elapsedHours / thresholdHours : 0;
    const breached = percentUsed >= 1.0;

    let alertGenerated: AlertSeverity | null = null;

    // ------------------------------------------------------------------
    // Req 5.3 — Critical alert + breach flag (≥ 100%)
    // ------------------------------------------------------------------
    if (breached) {
      const isDuplicate = await this.hasActiveAlert(requestId, journeyStage, AlertSeverity.Critical);
      if (!isDuplicate) {
        await db.insert(alerts).values({
          requestId,
          alertType: AlertType.SLABreach,
          severity: AlertSeverity.Critical,
          lifecycleState: 'Created',
          message: `SLA breached for request ${requestId} at stage "${journeyStage}". ` +
            `Elapsed: ${elapsedHours.toFixed(2)}h / Threshold: ${thresholdHours}h.`,
          metadata: { journeyStage, elapsedHours, thresholdHours, percentUsed },
        } satisfies NewAlert);

        alertGenerated = AlertSeverity.Critical;
      }

      // Always set the sla_breached flag on the service request (Req 5.3)
      await db
        .update(serviceRequests)
        .set({ slaBreached: true, updatedAt: new Date() })
        .where(eq(serviceRequests.id, requestId));
    }
    // ------------------------------------------------------------------
    // Req 5.2 — Warning alert (≥ 80% and < 100%)
    // ------------------------------------------------------------------
    else if (percentUsed >= 0.8) {
      const isDuplicate = await this.hasActiveAlert(requestId, journeyStage, AlertSeverity.Warning);
      if (!isDuplicate) {
        await db.insert(alerts).values({
          requestId,
          alertType: AlertType.SLABreach,
          severity: AlertSeverity.Warning,
          lifecycleState: 'Created',
          message: `SLA warning for request ${requestId} at stage "${journeyStage}". ` +
            `${(percentUsed * 100).toFixed(1)}% of threshold used ` +
            `(${elapsedHours.toFixed(2)}h / ${thresholdHours}h).`,
          metadata: { journeyStage, elapsedHours, thresholdHours, percentUsed },
        } satisfies NewAlert);

        alertGenerated = AlertSeverity.Warning;
      }
    }

    return {
      elapsedHours,
      thresholdHours,
      percentUsed,
      breached,
      alertGenerated,
    };
  }

  /**
   * Fetch the SLA rule for a given journey stage.
   * Returns null if no rule is configured for that stage.
   *
   * Requirements: 5.1, 5.6
   */
  async getRule(stage: JourneyStage): Promise<SLARule | null> {
    const [row] = await db
      .select()
      .from(slaRules)
      .where(eq(slaRules.journeyStage, stage))
      .limit(1);

    return row ?? null;
  }

  /**
   * Check whether a non-Archived alert already exists for the given
   * (request_id, journey_stage, severity) triple. Used for deduplication.
   *
   * Alert deduplication key: (request_id, metadata.journeyStage, severity)
   * among lifecycle_state != 'Archived'.
   *
   * Requirements: 5.2, 5.3
   */
  async hasActiveAlert(
    requestId: string,
    journeyStage: JourneyStage,
    severity: AlertSeverity,
  ): Promise<boolean> {
    const rows = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.requestId, requestId),
          eq(alerts.severity, severity),
          ne(alerts.lifecycleState, 'Archived'),
          // Match journey stage stored in metadata JSONB
          sql`${alerts.metadata}->>'journeyStage' = ${journeyStage}`,
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  /**
   * Update the SLA threshold for a journey stage and immediately re-apply
   * to all non-terminal (not Completed or Cancelled) service requests.
   *
   * "Apply immediately" in this context means the new threshold will be used
   * by the next evaluate() call — no retroactive alert generation happens here
   * (those are driven by the sla-evaluate BullMQ worker on state changes).
   *
   * Requirements: 5.5
   */
  async updateRules(stage: JourneyStage, thresholdHours: number): Promise<void> {
    const now = new Date();

    // Upsert: update existing rule or insert new one
    await db.execute(
      sql`
        INSERT INTO sla_rules (id, journey_stage, threshold_hours, created_at, updated_at)
        VALUES (gen_random_uuid(), ${stage}, ${thresholdHours}, ${now.toISOString()}, ${now.toISOString()})
        ON CONFLICT (journey_stage)
        DO UPDATE SET
          threshold_hours = EXCLUDED.threshold_hours,
          updated_at      = EXCLUDED.updated_at
      `,
    );

    logger.info(
      { stage, thresholdHours },
      '[sla-monitor] SLA rule updated — applies to all active non-terminal requests on next evaluation',
    );

    // Req 5.5 — The rule now applies to all non-terminal requests automatically
    // because evaluate() fetches the rule fresh on every call.
    // We log which active requests are affected for observability.
    const terminalStages = TERMINAL_STAGES as readonly string[];
    const activeCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.currentStage, stage),
          not(inArray(serviceRequests.currentStage, terminalStages as string[])),
        ),
      );

    logger.info(
      { stage, thresholdHours, activeRequestsOnStage: activeCount[0]?.count ?? 0 },
      '[sla-monitor] New threshold will apply on next evaluation for active requests at this stage',
    );
  }

  /**
   * Compute SLA compliance metrics for a time window.
   *
   * Compliance rate = (total - breached) / total  per group.
   * Returns 100% with zero records if no data exists for the period (Req 5.7).
   *
   * Requirements: 5.4, 5.7
   */
  async getComplianceMetrics(from: Date, to: Date): Promise<ComplianceMetrics> {
    // Query: group service_requests that were active in the period
    // Use created_at as a proxy for when the request entered the system.
    const rows = await db
      .select({
        department: serviceRequests.assignedDepartment,
        currentStage: serviceRequests.currentStage,
        slaBreached: serviceRequests.slaBreached,
      })
      .from(serviceRequests)
      .where(
        and(
          gte(serviceRequests.createdAt, from),
          lte(serviceRequests.createdAt, to),
        ),
      );

    if (rows.length === 0) {
      return { byDepartment: {}, byStage: {} };
    }

    // Aggregate by department
    const deptTotals: Record<string, { total: number; breached: number }> = {};
    const stageTotals: Record<string, { total: number; breached: number }> = {};

    for (const row of rows) {
      const dept = row.department ?? 'Unassigned';
      const stage = row.currentStage;

      if (!deptTotals[dept]) deptTotals[dept] = { total: 0, breached: 0 };
      if (!stageTotals[stage]) stageTotals[stage] = { total: 0, breached: 0 };

      deptTotals[dept].total++;
      stageTotals[stage].total++;

      if (row.slaBreached) {
        deptTotals[dept].breached++;
        stageTotals[stage].breached++;
      }
    }

    const byDepartment: Record<string, number> = {};
    for (const [dept, counts] of Object.entries(deptTotals)) {
      byDepartment[dept] =
        counts.total > 0 ? (counts.total - counts.breached) / counts.total : 1.0;
    }

    const byStage: Record<string, number> = {};
    for (const [stage, counts] of Object.entries(stageTotals)) {
      byStage[stage] =
        counts.total > 0 ? (counts.total - counts.breached) / counts.total : 1.0;
    }

    return { byDepartment, byStage };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const slaMonitorService = new SLAMonitorService();
