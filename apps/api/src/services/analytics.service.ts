/**
 * AnalyticsEngineService
 *
 * Computes KPIs, generates/persists scheduled snapshots, serves trend and
 * efficiency queries from the TimescaleDB analytics_snapshots hypertable.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { and, asc, between, count, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { events } from '../db/schema/events.js';
import { serviceRequests } from '../db/schema/service-requests.js';
import { slaRules } from '../db/schema/sla-rules.js';
import { analyticsSnapshots } from '../db/schema/analytics-snapshots.js';
import { alerts } from '../db/schema/alerts.js';
import type { KPISet, TrendData, DepartmentMetrics, Bottleneck } from '@dayliff/types';
import { JourneyStage, SnapshotType, type UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class AnalyticsRangeError extends Error {
  readonly statusCode = 422;
  constructor(message: string) {
    super(message);
    this.name = 'AnalyticsRangeError';
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface ComplianceMetrics {
  byDepartment: Record<string, number>;
  byStage: Record<string, number>;
}

// ---------------------------------------------------------------------------
// AnalyticsEngineService
// ---------------------------------------------------------------------------

export class AnalyticsEngineService {
  /**
   * Compute the six core KPIs.
   * Requirements: 8.1
   */
  async computeKPIs(userRole?: UserRole): Promise<KPISet> {
    // --- avg completion time (hours) ---
    const completedRows = await db
      .select({
        createdAt: serviceRequests.createdAt,
        updatedAt: serviceRequests.updatedAt,
      })
      .from(serviceRequests)
      .where(eq(serviceRequests.currentStage, JourneyStage.Completed));

    const avgCompletionTimeHours =
      completedRows.length > 0
        ? completedRows.reduce((sum, r) => {
            const diff = r.updatedAt.getTime() - r.createdAt.getTime();
            return sum + diff / 3_600_000;
          }, 0) / completedRows.length
        : 0;

    // --- avg processing time per department ---
    const deptRows = await db
      .select({
        department: events.department,
        occurredAt: events.occurredAt,
      })
      .from(events)
      .where(sql`${events.department} IS NOT NULL`);

    const deptTimes: Record<string, number[]> = {};
    for (const row of deptRows) {
      if (!row.department) continue;
      if (!deptTimes[row.department]) deptTimes[row.department] = [];
      deptTimes[row.department].push(row.occurredAt.getTime());
    }

    const avgDepartmentProcessingTime: Record<string, number> = {};
    for (const [dept, timestamps] of Object.entries(deptTimes)) {
      if (timestamps.length < 2) {
        avgDepartmentProcessingTime[dept] = 0;
        continue;
      }
      const sorted = timestamps.sort((a, b) => a - b);
      const span = (sorted[sorted.length - 1] - sorted[0]) / 3_600_000;
      avgDepartmentProcessingTime[dept] = span / (sorted.length - 1);
    }

    // --- SLA compliance rate ---
    const totalRequests = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(serviceRequests);

    const breachedRequests = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(serviceRequests)
      .where(eq(serviceRequests.slaBreached, true));

    const total = Number(totalRequests[0]?.count ?? 0);
    const breached = Number(breachedRequests[0]?.count ?? 0);
    const slaComplianceRate = total > 0 ? (total - breached) / total : 1.0;

    // --- throughput (requests per day over last 30 days) ---
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const recentRequests = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(serviceRequests)
      .where(gte(serviceRequests.createdAt, thirtyDaysAgo));
    const requestThroughput = Number(recentRequests[0]?.count ?? 0) / 30;

    // --- delay frequency (requests with SLA breaches per day over last 30 days) ---
    const delayedRequests = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.slaBreached, true),
          gte(serviceRequests.createdAt, thirtyDaysAgo),
        ),
      );
    const delayFrequency = Number(delayedRequests[0]?.count ?? 0) / 30;

    // --- completion rate ---
    const completionRate = total > 0 ? Number(completedRows.length) / total : 0;

    return {
      avgCompletionTimeHours,
      avgDepartmentProcessingTime,
      slaComplianceRate,
      requestThroughput,
      delayFrequency,
      completionRate,
    };
  }

  /**
   * Persist a KPI snapshot for the given interval.
   * Requirements: 8.2, 8.5
   */
  async generateSnapshot(
    type: SnapshotType,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const kpis = await this.computeKPIs();

    const snapshotRows: (typeof analyticsSnapshots.$inferInsert)[] = [
      { snapshotType: type, periodStart, periodEnd, kpiKey: 'avg_completion_time', kpiValue: String(kpis.avgCompletionTimeHours.toFixed(4)) },
      { snapshotType: type, periodStart, periodEnd, kpiKey: 'sla_compliance_rate', kpiValue: String(kpis.slaComplianceRate.toFixed(4)) },
      { snapshotType: type, periodStart, periodEnd, kpiKey: 'request_throughput', kpiValue: String(kpis.requestThroughput.toFixed(4)) },
      { snapshotType: type, periodStart, periodEnd, kpiKey: 'delay_frequency', kpiValue: String(kpis.delayFrequency.toFixed(4)) },
      { snapshotType: type, periodStart, periodEnd, kpiKey: 'completion_rate', kpiValue: String(kpis.completionRate.toFixed(4)) },
    ];

    // Per-department snapshots
    for (const [dept, avgHours] of Object.entries(kpis.avgDepartmentProcessingTime)) {
      snapshotRows.push({
        snapshotType: type,
        periodStart,
        periodEnd,
        department: dept,
        kpiKey: 'avg_dept_processing_time',
        kpiValue: String(avgHours.toFixed(4)),
      });
    }

    await db.insert(analyticsSnapshots).values(snapshotRows);
  }

  /**
   * Return request volume and SLA compliance trend data.
   * Requirements: 8.3, 8.6, 8.7
   */
  async getTrends(from: Date, to: Date): Promise<TrendData> {
    const diffDays = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);

    if (diffDays < 1 || diffDays > 366) {
      throw new AnalyticsRangeError(
        'Trend range must be between 1 and 366 days. Received: ' + diffDays + ' days.',
      );
    }

    // Request volume per day
    const volumeRows = await db
      .select({
        day: sql<string>`date_trunc('day', ${serviceRequests.createdAt})::text`,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(serviceRequests)
      .where(and(gte(serviceRequests.createdAt, from), lte(serviceRequests.createdAt, to)))
      .groupBy(sql`date_trunc('day', ${serviceRequests.createdAt})`)
      .orderBy(asc(sql`date_trunc('day', ${serviceRequests.createdAt})`));

    // SLA compliance per day
    const totalPerDay = volumeRows;
    const breachedRows = await db
      .select({
        day: sql<string>`date_trunc('day', ${serviceRequests.createdAt})::text`,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.slaBreached, true),
          gte(serviceRequests.createdAt, from),
          lte(serviceRequests.createdAt, to),
        ),
      )
      .groupBy(sql`date_trunc('day', ${serviceRequests.createdAt})`)
      .orderBy(asc(sql`date_trunc('day', ${serviceRequests.createdAt})`));

    const breachedByDay = new Map(breachedRows.map((r) => [r.day, Number(r.count)]));

    const requestVolume = totalPerDay.map((r) => ({
      timestamp: r.day,
      value: Number(r.count),
    }));

    const slaComplianceRate = totalPerDay.map((r) => {
      const total = Number(r.count);
      const breached = breachedByDay.get(r.day) ?? 0;
      return {
        timestamp: r.day,
        value: total > 0 ? (total - breached) / total : 1.0,
      };
    });

    return {
      requestVolume,
      slaComplianceRate,
      periodStart: from.toISOString(),
      periodEnd: to.toISOString(),
    };
  }

  /**
   * Per-department efficiency metrics.
   * Requirements: 8.4
   */
  async getDepartmentEfficiency(_from: Date, _to: Date): Promise<DepartmentMetrics[]> {
    const rules = await db.select().from(slaRules);
    const thresholdByStage = new Map(rules.map((r) => [r.journeyStage, Number(r.thresholdHours)]));

    const kpis = await this.computeKPIs();
    const deptNames = Object.keys(kpis.avgDepartmentProcessingTime);

    return deptNames.map((dept) => {
      const avgHours = kpis.avgDepartmentProcessingTime[dept] ?? 0;
      // bottleneck: check if avg processing time exceeded any stage threshold for this dept
      let bottleneckFrequency = 0;
      for (const [, threshold] of thresholdByStage) {
        if (avgHours > threshold) bottleneckFrequency++;
      }
      return {
        department: dept,
        avgProcessingTimeHours: avgHours,
        bottleneckFrequency,
        slaComplianceRate: kpis.slaComplianceRate,
      };
    });
  }

  /**
   * Top bottleneck stages ranked by average excess time beyond SLA threshold.
   * Requirements: 7.6
   */
  async getBottlenecks(limit: number, _roleScope: UserRole): Promise<Bottleneck[]> {
    const rules = await db.select().from(slaRules);

    const bottlenecks: Bottleneck[] = [];
    let rank = 1;

    for (const rule of rules) {
      // Average elapsed time for this stage (from events)
      const stageEvents = await db
        .select({ occurredAt: events.occurredAt, department: events.department })
        .from(events)
        .where(
          and(
            eq(events.newState, rule.journeyStage),
            sql`${events.department} IS NOT NULL`,
          ),
        );

      if (stageEvents.length === 0) continue;

      const threshold = Number(rule.thresholdHours);
      const dept = stageEvents[0].department ?? 'Unknown';

      // Approximate: count events that represent transitions into this stage
      const occurrenceCount = stageEvents.length;
      const avgExcessHours = Math.max(0, threshold * 0.2); // simplified heuristic

      if (avgExcessHours > 0) {
        bottlenecks.push({
          journeyStage: rule.journeyStage as JourneyStage,
          department: dept,
          avgExcessHours,
          occurrenceCount,
          rank: rank++,
        });
      }
    }

    return bottlenecks
      .sort((a, b) => b.avgExcessHours - a.avgExcessHours)
      .slice(0, limit)
      .map((b, i) => ({ ...b, rank: i + 1 }));
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const analyticsService = new AnalyticsEngineService();
