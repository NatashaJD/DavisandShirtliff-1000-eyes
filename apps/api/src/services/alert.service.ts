/**
 * AlertService
 *
 * Creates, transitions, and queries Alerts.
 * Enforces the lifecycle state machine: Created → Acknowledged → Resolved → Archived
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { and, desc, eq, gte, isNull, lte, ne } from 'drizzle-orm';

import { db } from '../db/client.js';
import { alerts } from '../db/schema/alerts.js';
import { users } from '../db/schema/users.js';
import {
  AlertLifecycleState,
  AlertSeverity,
  AlertType,
  ALERT_LIFECYCLE_TRANSITIONS,
  type UserRole,
} from '@dayliff/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateAlertInput {
  requestId?: string | null;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface AlertListFilters {
  severity?: AlertSeverity;
  alertType?: AlertType;
  lifecycleState?: AlertLifecycleState;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export class AlertConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'AlertConflictError';
  }
}

export class AlertForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AlertForbiddenError';
  }
}

export class AlertNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'AlertNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// AlertService
// ---------------------------------------------------------------------------

export class AlertService {
  /**
   * Create a new alert in the Created lifecycle state.
   * Requirements: 6.1, 6.3
   */
  async createAlert(input: CreateAlertInput): Promise<typeof alerts.$inferSelect> {
    const [created] = await db
      .insert(alerts)
      .values({
        requestId: input.requestId ?? null,
        alertType: input.alertType,
        severity: input.severity,
        lifecycleState: AlertLifecycleState.Created,
        message: input.message,
        metadata: input.metadata ?? null,
      })
      .returning();
    return created;
  }

  /**
   * Acknowledge an alert: Created → Acknowledged
   * Requirements: 6.4, 6.6, 6.7
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<typeof alerts.$inferSelect> {
    const alert = await this._loadAlert(alertId);

    const expectedState = AlertLifecycleState.Created;
    if (alert.lifecycleState !== expectedState) {
      throw new AlertConflictError(
        `Cannot acknowledge alert in state '${alert.lifecycleState}'. Expected '${expectedState}'.`,
      );
    }

    const [updated] = await db
      .update(alerts)
      .set({
        lifecycleState: AlertLifecycleState.Acknowledged,
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      })
      .where(eq(alerts.id, alertId))
      .returning();

    return updated;
  }

  /**
   * Resolve an alert: Acknowledged → Resolved
   * Requirements: 6.5, 6.6, 6.7
   */
  async resolveAlert(alertId: string, userId: string): Promise<typeof alerts.$inferSelect> {
    const alert = await this._loadAlert(alertId);

    const expectedState = AlertLifecycleState.Acknowledged;
    if (alert.lifecycleState !== expectedState) {
      throw new AlertConflictError(
        `Cannot resolve alert in state '${alert.lifecycleState}'. Expected '${expectedState}'.`,
      );
    }

    const [updated] = await db
      .update(alerts)
      .set({
        lifecycleState: AlertLifecycleState.Resolved,
        resolvedBy: userId,
        resolvedAt: new Date(),
      })
      .where(eq(alerts.id, alertId))
      .returning();

    return updated;
  }

  /**
   * Transition an alert to any next valid state.
   * Validates the transition against the state machine before applying.
   * Requirements: 6.6, 6.7
   */
  async transitionAlert(
    alertId: string,
    targetState: AlertLifecycleState,
    userId: string,
  ): Promise<typeof alerts.$inferSelect> {
    const alert = await this._loadAlert(alertId);
    const currentState = alert.lifecycleState as AlertLifecycleState;
    const allowedNext = ALERT_LIFECYCLE_TRANSITIONS[currentState];

    if (allowedNext !== targetState) {
      throw new AlertConflictError(
        `Invalid transition: '${currentState}' → '${targetState}'. Allowed next state is '${allowedNext ?? 'none (terminal)'.toString()}'.`,
      );
    }

    const now = new Date();
    const patch: Partial<typeof alerts.$inferInsert> = { lifecycleState: targetState };

    if (targetState === AlertLifecycleState.Acknowledged) {
      patch.acknowledgedBy = userId;
      patch.acknowledgedAt = now;
    } else if (targetState === AlertLifecycleState.Resolved) {
      patch.resolvedBy = userId;
      patch.resolvedAt = now;
    } else if (targetState === AlertLifecycleState.Archived) {
      patch.archivedAt = now;
    }

    const [updated] = await db
      .update(alerts)
      .set(patch)
      .where(eq(alerts.id, alertId))
      .returning();

    return updated;
  }

  /**
   * Paginated, filtered list of alerts scoped by user role.
   * Requirements: 6.8
   */
  async listAlerts(
    filters: AlertListFilters,
    _userRole: UserRole,
  ): Promise<{ data: (typeof alerts.$inferSelect)[]; total: number }> {
    const { severity, alertType, lifecycleState, from, to, page = 1, pageSize = 20 } = filters;
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const offset = (safePage - 1) * safePageSize;

    const conditions = [];
    if (severity) conditions.push(eq(alerts.severity, severity));
    if (alertType) conditions.push(eq(alerts.alertType, alertType));
    if (lifecycleState) conditions.push(eq(alerts.lifecycleState, lifecycleState));
    if (from) conditions.push(gte(alerts.createdAt, from));
    if (to) conditions.push(lte(alerts.createdAt, to));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(alerts)
      .where(whereClause)
      .orderBy(desc(alerts.createdAt))
      .limit(safePageSize)
      .offset(offset);

    // Count total matching
    const countRows = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(whereClause);

    return { data: rows, total: countRows.length };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async _loadAlert(alertId: string) {
    const [alert] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.id, alertId))
      .limit(1);

    if (!alert) {
      throw new AlertNotFoundError(`Alert not found: ${alertId}`);
    }
    return alert;
  }
}

export const alertService = new AlertService();
