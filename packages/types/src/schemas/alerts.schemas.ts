/**
 * Zod schemas for Alert API payloads
 * Requirements: 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { z } from 'zod';

import { AlertLifecycleState, AlertSeverity, AlertType } from '../enums.js';

export const PatchAlertSchema = z.object({
  action: z.enum(['acknowledge', 'resolve', 'archive'], {
    errorMap: () => ({ message: 'Action must be acknowledge, resolve, or archive' }),
  }),
});
export type PatchAlertPayload = z.infer<typeof PatchAlertSchema>;

export const GetAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  severity: z.nativeEnum(AlertSeverity).optional(),
  type: z.nativeEnum(AlertType).optional(),
  lifecycleState: z.nativeEnum(AlertLifecycleState).optional(),
  requestId: z.string().uuid().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
    .optional(),
});
export type GetAlertsQuery = z.infer<typeof GetAlertsQuerySchema>;
