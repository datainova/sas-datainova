import { z } from 'zod';
import {
  cadenceEnum,
  segmentAxisResponseSchema,
  segmentAxisSchema
} from '../objectives/objective.schemas';

export const indicatorParamsSchema = z.object({ id: z.string().uuid() });

export const indicatorResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  objectiveId: z.string().uuid().nullable(),
  type: z.enum(['KR', 'KPI']),
  title: z.string(),
  description: z.string(),
  cadence: cadenceEnum,
  startDate: z.date(),
  endDate: z.date(),
  unitCode: z.string(),
  unitCustom: z.string().nullable(),
  direction: z.enum(['INCREASE', 'DECREASE', 'MAINTAIN']),
  status: z.string()
});

export const indicatorDefinitionResponseSchema = indicatorResponseSchema.extend({
  segments: z.array(segmentAxisResponseSchema).default([])
});

export const indicatorSegmentUpdateSchema = z.object({
  segments: z.array(segmentAxisSchema)
});

export const indicatorTargetsSchema = z.object({
  targets: z.array(
    z.object({
      period: z.string().nullable().optional(),
      targetValue: z.number(),
      tolerance: z.number().nullable().optional(),
      baseline: z.number().nullable().optional()
    })
  )
});
