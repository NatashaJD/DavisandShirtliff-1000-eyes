/**
 * Zod schemas for Service Request API payloads
 * Requirements: 2.1, 2.2, 2.5, 2.6, 2.8
 */

import { z } from 'zod';

export const CreateServiceRequestSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required').max(255),
  customerContact: z.string().max(255).optional(),
  requestType: z.string().min(1, 'Request type is required').max(255),
  assignedDepartment: z.string().max(255).optional(),
  assignedUserId: z.string().uuid('Invalid user ID').optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateServiceRequestPayload = z.infer<typeof CreateServiceRequestSchema>;

export const PatchServiceRequestSchema = z
  .object({
    customerName: z.string().min(1).max(255).optional(),
    customerContact: z.string().max(255).nullable().optional(),
    requestType: z.string().min(1).max(255).optional(),
    currentStatus: z.string().min(1).max(255).optional(),
    assignedDepartment: z.string().max(255).nullable().optional(),
    assignedUserId: z.string().uuid('Invalid user ID').nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    slaBreached: z.boolean().optional(),
  })
  .strict(); // reject attempts to set id, request_number, or current_stage
export type PatchServiceRequestPayload = z.infer<typeof PatchServiceRequestSchema>;

export const GetRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  department: z.string().optional(),
  stage: z.string().optional(),
  status: z.string().optional(),
});
export type GetRequestsQuery = z.infer<typeof GetRequestsQuerySchema>;
