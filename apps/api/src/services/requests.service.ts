/**
 * ServiceRequestsService — CRUD operations for service_requests
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */

import { eq, sql, and, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db/client.js';
import { serviceRequests, type ServiceRequest, type NewServiceRequest } from '../db/schema/service-requests.js';
import { scopeRequestsForRole } from '../lib/scope.helpers.js';
import type { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

export const CreateRequestSchema = z.object({
  customerName: z.string().min(1),
  customerContact: z.string().optional(),
  requestType: z.string().min(1),
  assignedDepartment: z.string().optional(),
  assignedUserId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const PatchRequestSchema = z
  .object({
    customerName: z.string().min(1).optional(),
    customerContact: z.string().optional(),
    requestType: z.string().optional(),
    currentStatus: z.string().optional(),
    assignedDepartment: z.string().optional(),
    assignedUserId: z.string().uuid().optional().nullable(),
    metadata: z.record(z.unknown()).optional().nullable(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateRequestInput = z.infer<typeof CreateRequestSchema>;
export type PatchRequestInput = z.infer<typeof PatchRequestSchema>;

// ---------------------------------------------------------------------------
// Pagination types
// ---------------------------------------------------------------------------

export interface PaginatedResult<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// ServiceRequestsService
// ---------------------------------------------------------------------------

export class ServiceRequestsService {
  /**
   * Create a new service request.
   *
   * - Generates a UUID (handled by the DB default)
   * - Generates a human-readable request number SR-{YYYY}-{NNNNN} using a
   *   count-based sequence within a transaction (prevents duplicates under load)
   * - Sets currentStage = 'Inquiry'
   * - Returns the created record
   *
   * Requirement 2.1
   */
  async create(payload: CreateRequestInput, userId: string): Promise<ServiceRequest> {
    const now = new Date();
    const year = now.getFullYear().toString();

    return await db.transaction(async (tx) => {
      // Count existing requests for this year to derive the next sequence number
      const countResult = await tx.execute(
        sql`SELECT COUNT(*) AS cnt FROM service_requests WHERE request_number LIKE ${'SR-' + year + '-%'}`,
      );
      const count = Number((countResult.rows[0] as { cnt: string | number }).cnt);
      const requestNumber = `SR-${year}-${(count + 1).toString().padStart(5, '0')}`;

      const [created] = await tx
        .insert(serviceRequests)
        .values({
          requestNumber,
          customerName: payload.customerName,
          customerContact: payload.customerContact ?? null,
          requestType: payload.requestType,
          currentStage: 'Inquiry',
          currentStatus: 'Open',
          assignedDepartment: payload.assignedDepartment ?? null,
          assignedUserId: payload.assignedUserId ?? null,
          metadata: payload.metadata ?? null,
          slaBreached: false,
          createdAt: now,
          updatedAt: now,
        } satisfies NewServiceRequest)
        .returning();

      return created;
    });
  }

  /**
   * Return a paginated list of service requests scoped by role.
   *
   * - Admin and Regional Manager see all requests
   * - All other roles are filtered to assigned_department = department
   * - Default page 1, default pageSize 20, max 100
   *
   * Requirement 2.8
   */
  async list(
    page: number,
    pageSize: number,
    role: UserRole,
    department?: string,
  ): Promise<PaginatedResult<ServiceRequest>> {
    // Clamp pagination params
    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const offset = (safePage - 1) * safeSize;

    const scope = scopeRequestsForRole(role);
    const whereClause: SQL | undefined =
      scope.scope === 'department' && department
        ? eq(serviceRequests.assignedDepartment, department)
        : undefined;

    const [rows, countResult] = await Promise.all([
      whereClause
        ? db.select().from(serviceRequests).where(whereClause).limit(safeSize).offset(offset)
        : db.select().from(serviceRequests).limit(safeSize).offset(offset),
      whereClause
        ? db.select({ count: sql<number>`count(*)::int` }).from(serviceRequests).where(whereClause)
        : db.select({ count: sql<number>`count(*)::int` }).from(serviceRequests),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      records: rows,
      total: Number(total),
      page: safePage,
      pageSize: safeSize,
    };
  }

  /**
   * Return a single service request by ID, with role-scoping applied.
   * Returns null if not found or if the user's scope does not include this record.
   *
   * Requirement 2.3, 2.4
   */
  async getById(
    id: string,
    role: UserRole,
    department?: string,
  ): Promise<ServiceRequest | null> {
    const scope = scopeRequestsForRole(role);

    let whereClause: SQL;
    if (scope.scope === 'department' && department) {
      whereClause = and(
        eq(serviceRequests.id, id),
        eq(serviceRequests.assignedDepartment, department),
      ) as SQL;
    } else {
      whereClause = eq(serviceRequests.id, id);
    }

    const [row] = await db
      .select()
      .from(serviceRequests)
      .where(whereClause)
      .limit(1);

    return row ?? null;
  }

  /**
   * Apply a partial update to a service request.
   *
   * - Silently strips id, request_number, current_stage from the payload (immutable fields)
   * - Sets updated_at to now
   * - Returns the updated record, or null if not found / out of scope
   *
   * Requirement 2.5
   */
  async update(
    id: string,
    payload: PatchRequestInput,
    role: UserRole,
    department?: string,
  ): Promise<ServiceRequest | null> {
    // Confirm the record exists and is in scope before updating
    const existing = await this.getById(id, role, department);
    if (!existing) return null;

    const now = new Date();

    // Build the update payload — immutable fields are never included
    const updates: Partial<NewServiceRequest> & { updatedAt: Date } = {
      updatedAt: now,
    };

    if (payload.customerName !== undefined) updates.customerName = payload.customerName;
    if (payload.customerContact !== undefined) updates.customerContact = payload.customerContact;
    if (payload.requestType !== undefined) updates.requestType = payload.requestType;
    if (payload.currentStatus !== undefined) updates.currentStatus = payload.currentStatus;
    if ('assignedDepartment' in payload) updates.assignedDepartment = payload.assignedDepartment ?? null;
    if ('assignedUserId' in payload) updates.assignedUserId = payload.assignedUserId ?? null;
    if ('metadata' in payload) updates.metadata = payload.metadata ?? null;

    const [updated] = await db
      .update(serviceRequests)
      .set(updates)
      .where(eq(serviceRequests.id, id))
      .returning();

    return updated ?? null;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const serviceRequestsService = new ServiceRequestsService();
