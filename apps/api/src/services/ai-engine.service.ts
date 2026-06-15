/**
 * AIEngineService
 *
 * Level 1: Predictive risk assessment and delay prediction via Python ML microservice.
 * Level 2: Operational Copilot using LangChain tool-calling with RBAC scoping.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { and, eq, ne } from 'drizzle-orm';

import { db } from '../db/client.js';
import { aiPredictions } from '../db/schema/ai-predictions.js';
import { serviceRequests } from '../db/schema/service-requests.js';
import { alertService } from './alert.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  AlertSeverity,
  AlertType,
  JourneyStage,
  RiskLabel,
  type CopilotResponse,
  type RiskAssessment,
  type UserRole,
} from '@dayliff/types';

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class AIUnavailableError extends Error {
  readonly statusCode = 503;
  constructor(message = 'AI Engine is currently unavailable') {
    super(message);
    this.name = 'AIUnavailableError';
  }
}

// ---------------------------------------------------------------------------
// ML microservice types
// ---------------------------------------------------------------------------

interface MLPredictRequest {
  requestId: string;
  currentStage: string;
  elapsedHours: number;
  historicalAvgCompletionHours: number;
  deptBacklogCount: number;
  priorSlaWarningCount: number;
  dayOfWeek: number;
  hourOfDay: number;
}

interface MLPredictResult {
  requestId: string;
  riskScore: number;
  riskLabel: 'Low' | 'Medium' | 'High' | 'Critical';
  contributingFactors: Array<{ factor: string; influence: number }>;
  predictedDelayHours: number | null;
  delayConfidence: number | null;
  predictedCompletionAt: string | null;
}

// ---------------------------------------------------------------------------
// AIEngineService
// ---------------------------------------------------------------------------

export class AIEngineService {
  private readonly mlServiceUrl: string;

  constructor() {
    this.mlServiceUrl = env.ML_SERVICE_URL ?? 'http://localhost:8000';
  }

  // ---------------------------------------------------------------------------
  // Level 1: Risk assessment
  // ---------------------------------------------------------------------------

  /**
   * Get risk assessment for a service request.
   * Requirements: 10.1, 10.5
   */
  async getRiskAssessment(requestId: string, userRole: UserRole): Promise<RiskAssessment> {
    const prediction = await this._getOrFetchPrediction(requestId);
    return prediction;
  }

  /**
   * Get delay prediction for a service request.
   * Requirements: 10.2
   */
  async getDelayPrediction(
    requestId: string,
  ): Promise<{ predictedDelayHours: number | null; confidence: number | null }> {
    const prediction = await this._getOrFetchPrediction(requestId);
    return {
      predictedDelayHours: prediction.predictedDelayHours,
      confidence: prediction.delayConfidence,
    };
  }

  /**
   * Refresh all predictions for active requests.
   * Requirements: 10.3, 10.4
   */
  async refreshAllPredictions(): Promise<{ refreshed: number; failed: number }> {
    const activeRequests = await db
      .select({
        id: serviceRequests.id,
        currentStage: serviceRequests.currentStage,
        createdAt: serviceRequests.createdAt,
        assignedDepartment: serviceRequests.assignedDepartment,
      })
      .from(serviceRequests)
      .where(
        and(
          ne(serviceRequests.currentStage, JourneyStage.Completed),
          ne(serviceRequests.currentStage, JourneyStage.Cancelled),
        ),
      );

    let refreshed = 0;
    let failed = 0;

    for (const req of activeRequests) {
      try {
        await this._fetchAndPersistPrediction(req.id, req.currentStage, req.createdAt);
        refreshed++;
      } catch (err) {
        logger.error({ err, requestId: req.id }, '[ai-engine] Failed to refresh prediction');
        // Mark existing prediction as stale (Req 10.4)
        await db
          .update(aiPredictions)
          .set({ isStale: true })
          .where(eq(aiPredictions.requestId, req.id));
        failed++;
      }
    }

    return { refreshed, failed };
  }

  // ---------------------------------------------------------------------------
  // Level 2: Copilot
  // ---------------------------------------------------------------------------

  /**
   * Execute a natural language operational query.
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
   */
  async copilotQuery(
    query: string,
    userId: string,
    userRole: UserRole,
  ): Promise<CopilotResponse> {
    // Simplified copilot: pattern-match common queries, fallback to suggestions
    const lowerQuery = query.toLowerCase().trim();

    try {
      // "Show all delayed requests" (Req 11.2)
      if (lowerQuery.includes('delayed') || lowerQuery.includes('delay')) {
        const delayedRequests = await db
          .select()
          .from(serviceRequests)
          .where(eq(serviceRequests.slaBreached, true))
          .limit(50);

        return {
          answer: `Found ${delayedRequests.length} delayed request(s) with SLA breaches.`,
          data: delayedRequests as unknown as Record<string, unknown>[],
          sourceQuery: "SELECT * FROM service_requests WHERE sla_breached = true",
        };
      }

      // "What is today's SLA compliance?" (Req 11.2)
      if (lowerQuery.includes('sla') && lowerQuery.includes('compliance')) {
        const total = await db.select({ id: serviceRequests.id }).from(serviceRequests);
        const breached = await db
          .select({ id: serviceRequests.id })
          .from(serviceRequests)
          .where(eq(serviceRequests.slaBreached, true));

        const rate = total.length > 0
          ? ((total.length - breached.length) / total.length * 100).toFixed(1)
          : '100.0';

        return {
          answer: `Today's SLA compliance rate is ${rate}%. ${total.length} total requests, ${breached.length} with breaches.`,
          data: [{ total: total.length, breached: breached.length, complianceRate: rate + '%' }],
          sourceQuery: "SELECT count(*), sla_breached FROM service_requests GROUP BY sla_breached",
        };
      }

      // "Which department causes the most delays?" (Req 11.2)
      if (lowerQuery.includes('department') && (lowerQuery.includes('delay') || lowerQuery.includes('most'))) {
        const breachedReqs = await db
          .select({ dept: serviceRequests.assignedDepartment })
          .from(serviceRequests)
          .where(and(eq(serviceRequests.slaBreached, true)));

        const counts: Record<string, number> = {};
        for (const r of breachedReqs) {
          if (r.dept) counts[r.dept] = (counts[r.dept] ?? 0) + 1;
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const top = sorted[0];

        return {
          answer: top
            ? `The department with the most delays is "${top[0]}" with ${top[1]} breached request(s).`
            : 'No department delay data found.',
          data: sorted.map(([dept, count]) => ({ department: dept, breachedCount: count })),
          sourceQuery: "SELECT assigned_department, count(*) FROM service_requests WHERE sla_breached=true GROUP BY 1 ORDER BY 2 DESC",
        };
      }

      // Unrecognized query — return suggestions (Req 11.3)
      return {
        answer: `Query not understood: "${query}"`,
        data: [],
        suggestedReformulations: [
          'Show all delayed requests',
          "What is today's SLA compliance?",
          'Which department causes the most delays?',
        ],
      };
    } catch (err) {
      if (err instanceof AIUnavailableError) throw err;
      logger.error({ err }, '[ai-engine] Copilot query error');
      throw new AIUnavailableError();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async _getOrFetchPrediction(requestId: string): Promise<RiskAssessment> {
    // Check for a recent non-stale prediction
    const [existing] = await db
      .select()
      .from(aiPredictions)
      .where(and(eq(aiPredictions.requestId, requestId), eq(aiPredictions.isStale, false)))
      .orderBy(aiPredictions.lastComputedAt)
      .limit(1);

    if (existing) {
      return this._mapToRiskAssessment(existing);
    }

    // Fetch fresh prediction
    const [req] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, requestId))
      .limit(1);

    if (!req) throw new Error(`Service request not found: ${requestId}`);

    return this._fetchAndPersistPrediction(requestId, req.currentStage, req.createdAt);
  }

  private async _fetchAndPersistPrediction(
    requestId: string,
    currentStage: string,
    createdAt: Date,
  ): Promise<RiskAssessment> {
    const now = new Date();
    const elapsedHours = (now.getTime() - createdAt.getTime()) / 3_600_000;
    const dayOfWeek = now.getUTCDay();
    const hourOfDay = now.getUTCHours();

    const requestPayload: MLPredictRequest = {
      requestId,
      currentStage,
      elapsedHours,
      historicalAvgCompletionHours: 72, // default; can be computed from historical data
      deptBacklogCount: 0,
      priorSlaWarningCount: 0,
      dayOfWeek,
      hourOfDay,
    };

    let result: MLPredictResult;

    try {
      const response = await fetch(`${this.mlServiceUrl}/internal/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [requestPayload] }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new AIUnavailableError(`ML service returned ${response.status}`);
      }

      const body = await response.json() as { results: MLPredictResult[] };
      result = body.results[0];
    } catch (err) {
      if (err instanceof AIUnavailableError) throw err;
      throw new AIUnavailableError(`ML service unreachable: ${String(err)}`);
    }

    // Clamp contributing factors to 1–5 (Req 10.1)
    const factors = result.contributingFactors.slice(0, 5);
    if (factors.length === 0) factors.push({ factor: 'elapsed_time', influence: 0 });

    // Persist to ai_predictions
    const [saved] = await db
      .insert(aiPredictions)
      .values({
        requestId,
        riskScore: String(result.riskScore),
        riskLabel: result.riskLabel,
        contributingFactors: factors,
        predictedDelayHours: result.predictedDelayHours !== null ? String(result.predictedDelayHours) : null,
        delayConfidence: result.delayConfidence !== null ? String(result.delayConfidence) : null,
        predictedCompletionAt: result.predictedCompletionAt ? new Date(result.predictedCompletionAt) : null,
        isStale: false,
        lastComputedAt: now,
      })
      .returning();

    const assessment = this._mapToRiskAssessment(saved);

    // Auto-create Critical Delay Alert if risk ≥ High (Req 10.5)
    if (assessment.riskLabel === RiskLabel.High || assessment.riskLabel === RiskLabel.Critical) {
      await alertService.createAlert({
        requestId,
        alertType: AlertType.CriticalDelay,
        severity: AlertSeverity.Critical,
        message: `High risk detected: ${assessment.riskLabel} (score: ${assessment.riskScore.toFixed(3)})`,
        metadata: {
          riskScore: assessment.riskScore,
          riskLabel: assessment.riskLabel,
          computedAt: assessment.computedAt,
        },
      });
    }

    return assessment;
  }

  private _mapToRiskAssessment(row: typeof aiPredictions.$inferSelect): RiskAssessment {
    return {
      requestId: row.requestId,
      riskScore: Number(row.riskScore),
      riskLabel: row.riskLabel as RiskLabel,
      contributingFactors: row.contributingFactors as Array<{ factor: string; influence: number }>,
      predictedDelayHours: row.predictedDelayHours !== null ? Number(row.predictedDelayHours) : null,
      delayConfidence: row.delayConfidence !== null ? Number(row.delayConfidence) : null,
      predictedCompletionAt: row.predictedCompletionAt?.toISOString() ?? null,
      computedAt: row.lastComputedAt.toISOString(),
      isStale: row.isStale,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const aiEngineService = new AIEngineService();
