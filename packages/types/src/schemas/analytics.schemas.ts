/**
 * Zod schemas for Analytics API payloads
 * Requirements: 8.3, 8.4, 8.7
 */

import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const dateRangeRefinement = (maxDays: number, errorMessage: string) =>
  z
    .object({ from: dateString, to: dateString })
    .refine(
      (data) => {
        const from = new Date(data.from);
        const to = new Date(data.to);
        const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays >= 1 && diffDays <= maxDays;
      },
      { message: errorMessage },
    );

export const GetTrendsQuerySchema = dateRangeRefinement(
  366,
  'Date range must be between 1 and 366 days',
);
export type GetTrendsQuery = z.infer<typeof GetTrendsQuerySchema>;

export const GetDepartmentMetricsQuerySchema = z.object({
  from: dateString,
  to: dateString,
  department: z.string().optional(),
});
export type GetDepartmentMetricsQuery = z.infer<typeof GetDepartmentMetricsQuerySchema>;

export const GetReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['Daily', 'Weekly', 'Monthly', 'Quarterly']).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});
export type GetReportsQuery = z.infer<typeof GetReportsQuerySchema>;
