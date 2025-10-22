import { z } from 'zod';

export const cadenceEnum = z.enum([
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
  'BIENNIAL'
]);

export const directionEnum = z.enum(['INCREASE', 'DECREASE', 'MAINTAIN']);

export const objectiveBaseSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  cadence: cadenceEnum,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  teamId: z.string().uuid().nullable().optional()
});

export const segmentAxisSchema = z.object({
  label: z.string().min(2),
  code: z.string().min(1),
  values: z
    .array(
      z.object({
        value: z.string().min(1),
        code: z.string().min(1)
      })
    )
    .default([])
});

export const segmentValueResponseSchema = z.object({
  id: z.string().uuid(),
  value: z.string(),
  code: z.string()
});

export const segmentAxisResponseSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  code: z.string(),
  values: z.array(segmentValueResponseSchema)
});

export const createObjectiveSchema = z.object({
  body: objectiveBaseSchema.extend({
    segments: z.array(segmentAxisSchema).optional()
  })
});

export const objectiveIdParams = z.object({ id: z.string().uuid() });

export const updateObjectiveSchema = z.object({
  params: objectiveIdParams,
  body: objectiveBaseSchema
    .partial()
    .extend({
      status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional()
    })
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return data.startDate <= data.endDate;
        }
        return true;
      },
      { message: 'Invalid period', path: ['startDate'] }
    )
});

export const completeObjectiveSchema = z.object({
  params: objectiveIdParams
});

export const createIndicatorSchema = z.object({
  body: z
    .object({
      objectiveId: z.string().uuid().optional(),
      type: z.enum(['KR', 'KPI']),
      title: z.string().min(3),
      description: z.string().min(10),
      cadence: cadenceEnum,
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      unitCode: z.string().min(1),
      unitCustom: z.string().optional(),
      direction: directionEnum,
      segments: z.array(segmentAxisSchema).optional()
    })
    .refine(
      (data) => data.startDate <= data.endDate,
      { message: 'Indicator start date must be before end date', path: ['startDate'] }
    )
});

export type CreateObjectiveInput = z.infer<typeof createObjectiveSchema>['body'];
export type CreateIndicatorInput = z.infer<typeof createIndicatorSchema>['body'];
