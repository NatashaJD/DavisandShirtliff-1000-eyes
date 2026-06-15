/**
 * Service-layer row-level scoping helpers
 *
 * These helpers translate a UserRole into query-level filter descriptors.
 * They are intentionally pure functions with no DB or HTTP dependencies,
 * so they can be imported and unit-tested in isolation.
 *
 * Requirements: 1.8, 2.7, 2.8, 7.1–7.5
 */

import { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Scope descriptor types
// ---------------------------------------------------------------------------

/**
 * Describes the row-level filter that should be applied when querying
 * service_requests for a given role.
 *
 * - `{ scope: 'all' }`  — no WHERE restriction; return every request
 * - `{ scope: 'department' }` — restrict to `assigned_department = user.dept`
 */
export type RequestScope =
  | { scope: 'all' }
  | { scope: 'department' };

/**
 * Describes the dashboard visibility scope for a role.
 *
 * - `'all'`        — cross-department view (Admin / Regional Manager)
 * - `'department'` — own-department view (all other roles)
 */
export type DashboardScope = 'all' | 'department';

// ---------------------------------------------------------------------------
// Scoping helpers
// ---------------------------------------------------------------------------

/**
 * Returns the row-level filter descriptor for service_requests.
 *
 * Admin and Regional Manager can see all requests.
 * All other roles are restricted to their assigned department.
 *
 * Requirements: 2.7, 2.8
 */
export function scopeRequestsForRole(role: UserRole): RequestScope {
  if (isAdminOrManager(role)) {
    return { scope: 'all' };
  }
  return { scope: 'department' };
}

/**
 * Returns the severity filter set for alerts visible to the given role.
 *
 * Per the permission matrix all roles that have the AcknowledgeResolveAlerts
 * permission (i.e., every role) can see alerts at every severity level.
 * The returned set therefore always contains all three severity strings.
 *
 * If future requirements restrict certain roles to a subset of severities
 * this function is the single place to update.
 *
 * Requirements: 6.2, 6.8
 */
export function scopeAlertsForRole(
  _role: UserRole,
): Set<'Info' | 'Warning' | 'Critical'> {
  // All authenticated roles with alert permission see all severity levels
  return new Set(['Info', 'Warning', 'Critical'] as const);
}

/**
 * Returns the dashboard scope for the given role.
 *
 * Admin and Regional Manager get a cross-department ('all') view.
 * All other roles see only their own department's data.
 *
 * Requirements: 7.1–7.5
 */
export function scopeDashboardForRole(role: UserRole): DashboardScope {
  return isAdminOrManager(role) ? 'all' : 'department';
}

/**
 * Convenience predicate — true for Administrator and Regional Manager.
 * Used throughout the service layer to gate privileged query paths.
 */
export function isAdminOrManager(role: UserRole): boolean {
  return role === UserRole.Administrator || role === UserRole.RegionalManager;
}
