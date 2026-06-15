/**
 * Zod schemas for SLA API payloads
 * Requirements: 5.4, 5.5, 5.7
 */

import { z } from 'zod';

import { JourneyStage } from '../enums.js';

export const UpdateSLARuleSchema = z.object({
  thresholdHours: z
    .number()
    .positive('Threshold must be greater than 0')
    .max(8760, 'Threshold cannot exceed 8760 hours (1 year)'),
  description: z.string().max(1000).optional(),
});
export type UpdateSLARulePayload = z.infer<typeof UpdateSLARuleSchema>;

export const GetSLAComplianceQuerySchema = z
  .object({
    from: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        'Date must be in YYYY-MM-DD format',
      ),
    to: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        'Date must be in YYYY-MM-DD format',
      ),
    department: z.string().optional(),
    stage: z.nativeEnum(JourneyStage).optional(),
  })
  .refine(
    (data) => {
      const from = new Date(data.from);
      const to = new Date(data.to);
      const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 1 && diffDays <= 365;
    },
    { message: 'Date range must be between 1 and 365 calendar days' },
  );
export type GetSLAComplianceQuery = z.infer<typeof GetSLAComplianceQuerySchema>;
