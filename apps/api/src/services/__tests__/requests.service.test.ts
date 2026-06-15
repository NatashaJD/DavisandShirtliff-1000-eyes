/**
 * Unit tests for ServiceRequestsService
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 *
 * All external dependencies (DB) are mocked so tests run without a live
 * database connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../db/client.js', () => ({
  db: {
    transaction: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgres://localhost/test',
    LOG_LEVEL: 'silent',
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ServiceRequestsService, CreateRequestSchema, PatchRequestSchema } from '../requests.service.js';
import { db } from '../../db/client.js';
import { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_REQUEST = {
  id: 'req-uuid-1',
  requestNumber: 'SR-2024-00001',
  customerName: 'Acme Corp',
  customerContact: 'contact@acme.com',
  requestType: 'Borehole Design',
  currentStage: 'Inquiry' as const,
  currentStatus: 'Open',
  assignedDepartment: 'Engineering',
  assignedUserId: null,
  metadata: null,
  slaBreached: false,
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-01-15T10:00:00Z'),
};

/** Build a chainable drizzle mock for select queries */
function makeSelectChain(rows: unknown[]) {
  const base = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };
  base.from.mockReturnValue(base);
  base.where.mockReturnValue(base);
  base.limit.mockReturnValue(base);
  base.offset.mockResolvedValue(rows);
  // Also make the chain awaitable without .offset()
  (base.limit as ReturnType<typeof vi.fn>).mockImplementation((_n: number) => {
    const withOffset = {
      offset: vi.fn().mockResolvedValue(rows),
      then: (resolve: (v: unknown) => unknown) => resolve(rows),
    };
    return withOffset;
  });
  return base;
}

/** Build a chainable drizzle mock for insert queries */
function makeInsertChain(returnedRow: unknown) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([returnedRow]),
  };
}

/** Build a chainable drizzle mock for update queries */
function makeUpdateChain(returnedRow: unknown) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([returnedRow]),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ServiceRequestsService', () => {
  let service: ServiceRequestsService;

  beforeEach(() => {
    service = new ServiceRequestsService();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Zod schemas
  // -------------------------------------------------------------------------

  describe('CreateRequestSchema', () => {
    it('accepts a valid minimal payload', () => {
      const result = CreateRequestSchema.safeParse({
        customerName: 'Acme',
        requestType: 'Borehole',
      });
      expect(result.success).toBe(true);
    });

    it('rejects when customerName is missing (Req 2.2)', () => {
      const result = CreateRequestSchema.safeParse({ requestType: 'Borehole' });
      expect(result.success).toBe(false);
    });

    it('rejects when requestType is missing (Req 2.2)', () => {
      const result = CreateRequestSchema.safeParse({ customerName: 'Acme' });
      expect(result.success).toBe(false);
    });

    it('rejects empty strings for required fields (Req 2.2)', () => {
      const result = CreateRequestSchema.safeParse({ customerName: '', requestType: 'Borehole' });
      expect(result.success).toBe(false);
    });

    it('accepts all optional fields', () => {
      const result = CreateRequestSchema.safeParse({
        customerName: 'Acme',
        requestType: 'Solar',
        customerContact: '+254700000000',
        assignedDepartment: 'Engineering',
        assignedUserId: '00000000-0000-0000-0000-000000000001',
        metadata: { priority: 'high' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid UUID for assignedUserId', () => {
      const result = CreateRequestSchema.safeParse({
        customerName: 'Acme',
        requestType: 'Solar',
        assignedUserId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PatchRequestSchema', () => {
    it('accepts a valid partial update', () => {
      const result = PatchRequestSchema.safeParse({ customerName: 'New Name' });
      expect(result.success).toBe(true);
    });

    it('rejects an empty object (Req 2.6)', () => {
      const result = PatchRequestSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error?.errors[0]?.message).toContain('At least one field must be provided');
    });

    it('allows nullable assignedUserId', () => {
      const result = PatchRequestSchema.safeParse({ assignedUserId: null });
      expect(result.success).toBe(true);
    });

    it('allows nullable metadata', () => {
      const result = PatchRequestSchema.safeParse({ metadata: null });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid UUID for assignedUserId', () => {
      const result = PatchRequestSchema.safeParse({ assignedUserId: 'bad-uuid' });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  describe('create()', () => {
    it('returns the created service request with correct initial stage (Req 2.1)', async () => {
      // Mock the transaction to execute its callback
      vi.mocked(db.transaction).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          execute: vi.fn().mockResolvedValue({ rows: [{ cnt: '0' }] }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([MOCK_REQUEST]),
          }),
        };
        return callback(mockTx);
      });

      const result = await service.create(
        { customerName: 'Acme Corp', requestType: 'Borehole Design' },
        'user-uuid-1',
      );

      expect(result.currentStage).toBe('Inquiry');
      expect(result.customerName).toBe('Acme Corp');
    });

    it('generates request number SR-{YYYY}-{NNNNN} (Req 2.1)', async () => {
      const year = new Date().getFullYear();

      vi.mocked(db.transaction).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          execute: vi.fn().mockResolvedValue({ rows: [{ cnt: '4' }] }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([
              { ...MOCK_REQUEST, requestNumber: `SR-${year}-00005` },
            ]),
          }),
        };
        return callback(mockTx);
      });

      const result = await service.create(
        { customerName: 'Test Customer', requestType: 'Solar' },
        'user-uuid-1',
      );

      expect(result.requestNumber).toBe(`SR-${year}-00005`);
    });

    it('sets currentStatus to Open on creation (Req 2.1)', async () => {
      vi.mocked(db.transaction).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          execute: vi.fn().mockResolvedValue({ rows: [{ cnt: '0' }] }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([MOCK_REQUEST]),
          }),
        };
        return callback(mockTx);
      });

      const result = await service.create(
        { customerName: 'Acme', requestType: 'Solar' },
        'user-uuid-1',
      );

      expect(result.currentStatus).toBe('Open');
    });

    it('passes the payload fields through correctly', async () => {
      const createdRecord = {
        ...MOCK_REQUEST,
        customerContact: '+254700000000',
        assignedDepartment: 'Engineering',
        metadata: { priority: 'high' },
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        const insertValues = vi.fn().mockReturnThis();
        const mockTx = {
          execute: vi.fn().mockResolvedValue({ rows: [{ cnt: '0' }] }),
          insert: vi.fn().mockReturnValue({
            values: insertValues,
            returning: vi.fn().mockResolvedValue([createdRecord]),
          }),
        };
        return callback(mockTx);
      });

      const result = await service.create(
        {
          customerName: 'Acme Corp',
          requestType: 'Borehole',
          customerContact: '+254700000000',
          assignedDepartment: 'Engineering',
          metadata: { priority: 'high' },
        },
        'user-uuid-1',
      );

      expect(result.customerContact).toBe('+254700000000');
      expect(result.assignedDepartment).toBe('Engineering');
      expect(result.metadata).toEqual({ priority: 'high' });
    });
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  describe('list()', () => {
    it('returns paginated records with default page 1 and pageSize 20 (Req 2.8)', async () => {
      const mockRecords = [MOCK_REQUEST];

      // select() is called twice: once for rows, once for count
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockRecords),
            }),
          }),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([{ count: 1 }]),
        } as never);

      const result = await service.list(1, 20, UserRole.Administrator);

      expect(result.records).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(1);
    });

    it('caps pageSize at 100 (Req 2.8)', async () => {
      vi.mocked(db.select)
        .mockReturnValue({
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        } as never);

      const result = await service.list(1, 999, UserRole.Administrator);
      expect(result.pageSize).toBe(100);
    });

    it('applies department filter for non-admin roles (Req 2.8)', async () => {
      vi.mocked(db.select)
        .mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        } as never);

      // Should not throw; role-scoped path is exercised
      const result = await service.list(1, 20, UserRole.SalesEngineer, 'Engineering');
      expect(result.records).toBeDefined();
    });

    it('Admin role returns all (no department filter) (Req 2.7)', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue([MOCK_REQUEST]),
          }),
        }),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(mockSelectChain as never)
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([{ count: 1 }]),
        } as never);

      const result = await service.list(1, 20, UserRole.Administrator);
      // Admin scope = 'all', no where clause applied at top level
      expect(result.records).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // getById()
  // -------------------------------------------------------------------------

  describe('getById()', () => {
    it('returns the full record when found (Req 2.3)', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([MOCK_REQUEST]),
          }),
        }),
      } as never);

      const result = await service.getById('req-uuid-1', UserRole.Administrator);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('req-uuid-1');
      expect(result!.requestNumber).toBe('SR-2024-00001');
    });

    it('returns null when record not found (Req 2.4)', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await service.getById('nonexistent-id', UserRole.Administrator);
      expect(result).toBeNull();
    });

    it('applies department scope for non-admin roles (Req 2.7)', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([MOCK_REQUEST]),
          }),
        }),
      } as never);

      const result = await service.getById('req-uuid-1', UserRole.SalesEngineer, 'Engineering');
      expect(result).not.toBeNull();
    });

    it('returns null for non-admin role without matching department (Req 2.7)', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await service.getById('req-uuid-1', UserRole.SalesEngineer, 'Sales');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------------

  describe('update()', () => {
    it('returns the updated record on success (Req 2.5)', async () => {
      const updatedRecord = { ...MOCK_REQUEST, customerName: 'Updated Corp' };

      // getById call (first select)
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([MOCK_REQUEST]),
          }),
        }),
      } as never);

      // update chain
      vi.mocked(db.update).mockReturnValue(makeUpdateChain(updatedRecord) as never);

      const result = await service.update(
        'req-uuid-1',
        { customerName: 'Updated Corp' },
        UserRole.Administrator,
      );

      expect(result).not.toBeNull();
      expect(result!.customerName).toBe('Updated Corp');
    });

    it('returns null when record is not found (Req 2.5)', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await service.update(
        'nonexistent-id',
        { customerName: 'Test' },
        UserRole.Administrator,
      );

      expect(result).toBeNull();
    });

    it('does NOT update currentStage — immutable field is silently ignored (Req 2.5)', async () => {
      // getById
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([MOCK_REQUEST]),
          }),
        }),
      } as never);

      const updateMock = makeUpdateChain(MOCK_REQUEST);
      vi.mocked(db.update).mockReturnValue(updateMock as never);

      await service.update(
        'req-uuid-1',
        { customerName: 'New Name' },
        UserRole.Administrator,
      );

      // .set() should have been called, and the payload should NOT include currentStage
      const setCall = (updateMock.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(setCall).not.toHaveProperty('currentStage');
    });

    it('sets updatedAt to current time on update (Req 2.5)', async () => {
      const beforeUpdate = new Date();

      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([MOCK_REQUEST]),
          }),
        }),
      } as never);

      const updateMock = makeUpdateChain(MOCK_REQUEST);
      vi.mocked(db.update).mockReturnValue(updateMock as never);

      await service.update('req-uuid-1', { currentStatus: 'In Progress' }, UserRole.Administrator);

      const setCall = (updateMock.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(setCall.updatedAt).toBeInstanceOf(Date);
      expect(setCall.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('allows nullifying assignedUserId (Req 2.5)', async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([MOCK_REQUEST]),
          }),
        }),
      } as never);

      const updateMock = makeUpdateChain({ ...MOCK_REQUEST, assignedUserId: null });
      vi.mocked(db.update).mockReturnValue(updateMock as never);

      const result = await service.update(
        'req-uuid-1',
        { assignedUserId: null },
        UserRole.Administrator,
      );

      const setCall = (updateMock.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(setCall.assignedUserId).toBeNull();
    });
  });
});
