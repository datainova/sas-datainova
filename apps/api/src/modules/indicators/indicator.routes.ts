import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { segmentAxisSchema } from '../objectives/objective.schemas';
import { recordAudit } from '../../utils/audit';
import {
  indicatorDefinitionResponseSchema,
  indicatorParamsSchema,
  indicatorSegmentUpdateSchema,
  indicatorTargetsSchema
} from './indicator.schemas';

export const registerIndicatorRoutes = (app: FastifyInstance) => {
  app.get(
    '/indicators',
    {
      schema: {
        querystring: z.object({
          type: z.enum(['KR', 'KPI']).optional(),
          objectiveId: z.string().uuid().optional(),
          page: z.coerce.number().min(1).optional(),
          pageSize: z.coerce.number().min(1).max(100).optional()
        }),
        response: {
          200: z.object({
            items: z.array(indicatorDefinitionResponseSchema),
            page: z.number(),
            pageSize: z.number(),
            total: z.number()
          })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
      const { type, objectiveId, page = 1, pageSize = 20 } = request.query as {
        type?: 'KR' | 'KPI';
        objectiveId?: string;
        page?: number;
        pageSize?: number;
      };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const where = {
          orgId: ctx.orgId,
          ...(type ? { type } : {}),
          ...(objectiveId ? { objectiveId } : {})
        };

        const [total, items] = await Promise.all([
          tx.indicatorDefinition.count({ where }),
          tx.indicatorDefinition.findMany({
            where,
            include: {
              segments: { include: { values: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize
          })
        ]);

        return {
          items,
          page,
          pageSize,
          total
        };
      });
    }
  );

  app.get(
    '/indicators/:id',
    {
      schema: {
        params: indicatorParamsSchema,
        response: {
          200: indicatorDefinitionResponseSchema
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
      const { id } = request.params as { id: string };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const indicator = await tx.indicatorDefinition.findFirst({
          where: { id, orgId: ctx.orgId },
          include: {
            segments: { include: { values: true } }
          }
        });

        if (!indicator) {
          throw app.httpErrors.notFound('indicator not found');
        }

        return indicator;
      });
    }
  );

  app.get(
    '/indicators/:id/values',
    {
      schema: {
        params: indicatorParamsSchema,
        querystring: z.object({
          range: z.string().optional(),
          segment: z.string().optional()
        }),
        response: {
          200: z.object({
            indicatorId: z.string().uuid(),
            values: z.array(
              z.object({
                id: z.string().uuid(),
                period: z.string(),
                segmentKey: z.string().nullable(),
                value: z.number(),
                status: z.enum(['ON', 'RISK', 'OFF']),
                version: z.number(),
                collectedAt: z.date()
              })
            )
          })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
      const { id } = request.params as { id: string };
      const { range, segment } = request.query as { range?: string; segment?: string };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const indicator = await tx.indicatorDefinition.findFirst({
          where: { id, orgId: ctx.orgId },
          select: { id: true }
        });

        if (!indicator) {
          throw app.httpErrors.notFound('indicator not found');
        }

        const [startPeriod, endPeriod] = parseRange(range);

        const values = await tx.indicatorValue.findMany({
          where: {
            indicatorId: id,
            ...(segment ? { segmentKey: segment } : {}),
            ...(startPeriod || endPeriod
              ? {
                  period: {
                    ...(startPeriod ? { gte: startPeriod } : {}),
                    ...(endPeriod ? { lte: endPeriod } : {})
                  }
                }
              : {})
          },
          orderBy: [
            { period: 'asc' },
            { version: 'asc' }
          ]
        });

        return {
          indicatorId: id,
          values: values.map((value) => ({
            id: value.id,
            period: value.period,
            segmentKey: value.segmentKey,
            value: value.value,
            status: value.statusCalc,
            version: value.version,
            collectedAt: value.collectedAt
          }))
        };
      });
    }
  );

  app.post(
    '/indicators/:id/segments',
    {
      schema: {
        params: indicatorParamsSchema,
        body: indicatorSegmentUpdateSchema,
        response: {
          200: z.object({
            id: z.string().uuid(),
            segments: z.array(segmentAxisSchema)
          })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const { id } = request.params as { id: string };
      const { segments } = request.body as z.infer<typeof indicatorSegmentUpdateSchema>;

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const indicator = await tx.indicatorDefinition.findFirst({
          where: { id, orgId: ctx.orgId }
        });

        if (!indicator) throw app.httpErrors.notFound('indicator not found');

        await tx.indicatorSegmentValue.deleteMany({
          where: { axis: { indicatorId: id } }
        });
        await tx.indicatorSegmentAxis.deleteMany({
          where: { indicatorId: id }
        });
        await tx.indicatorDefinition.update({
          where: { id },
          data: {
            segments: {
              create: segments.map((segment) => ({
                label: segment.label,
                code: segment.code,
                values: {
                  create: segment.values.map((value) => ({
                    value: value.value,
                    code: value.code
                  }))
                }
              }))
            }
          }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'IndicatorDefinition',
          entityId: id,
          action: 'SEGMENTS_UPDATED',
          before: indicator,
          after: segments
        });

        return { id, segments };
      });
    }
  );

  app.post(
    '/indicators/:id/targets',
    {
      schema: {
        params: indicatorParamsSchema,
        body: indicatorTargetsSchema
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const { id } = request.params as { id: string };
      const { targets } = request.body as z.infer<typeof indicatorTargetsSchema>;

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const indicator = await tx.indicatorDefinition.findFirst({
          where: { id, orgId: ctx.orgId }
        });
        if (!indicator) throw app.httpErrors.notFound('indicator not found');

        await upsertTargets(tx, id, targets);

        await recordAudit({
          tx,
          ctx,
          entity: 'IndicatorDefinition',
          entityId: id,
          action: 'TARGETS_UPDATED',
          before: null,
          after: targets
        });

        return { indicatorId: id, targets };
      });
    }
  );
};

export const upsertTargets = async (
  tx: PrismaClient,
  indicatorId: string,
  targets: Array<{ period?: string | null; targetValue: number; tolerance?: number | null; baseline?: number | null }>
) => {
  if (targets.length) {
    const deleteConditions = targets.map((target) =>
      target.period ? { period: target.period } : { period: null }
    );
    await tx.indicatorTarget.deleteMany({
      where: {
        indicatorId,
        OR: deleteConditions
      }
    });
  }

  if (targets.length) {
    await tx.indicatorTarget.createMany({
      data: targets.map((target) => ({
        indicatorId,
        period: target.period ?? null,
        targetValue: target.targetValue,
        tolerance: target.tolerance ?? null,
        baseline: target.baseline ?? null
      }))
    });
  }
};

export const parseRange = (range?: string): [string | undefined, string | undefined] => {
  if (!range) return [undefined, undefined];
  const delimiter = range.includes('..') ? '..' : range.includes(':') ? ':' : null;
  if (!delimiter) {
    return [range, undefined];
  }
  const [start, end] = range.split(delimiter);
  return [start || undefined, end || undefined];
};
