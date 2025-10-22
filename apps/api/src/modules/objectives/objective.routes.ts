import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  cadenceEnum,
  createIndicatorSchema,
  createObjectiveSchema,
  objectiveIdParams,
  segmentAxisSchema,
  segmentAxisResponseSchema,
  updateObjectiveSchema
} from './objective.schemas';
import { compareCadence } from '../../utils/cadence';
import { enforceLimitCapacity } from '../../utils/plan';
import { recordAudit } from '../../utils/audit';
import {
  indicatorDefinitionResponseSchema,
  indicatorResponseSchema
} from '../indicators/indicator.schemas';

const objectiveResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  cadence: cadenceEnum,
  startDate: z.date(),
  endDate: z.date(),
  status: z.string(),
  teamId: z.string().uuid().nullable(),
  segments: z.array(segmentAxisResponseSchema).default([])
});

export const registerObjectiveRoutes = (app: FastifyInstance) => {
  app.get(
    '/objectives',
    {
      schema: {
        querystring: z.object({
          status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
          search: z.string().optional(),
          page: z.coerce.number().int().min(1).optional(),
          pageSize: z.coerce.number().int().min(1).max(100).optional()
        }),
        response: {
          200: z.object({
            items: z.array(objectiveResponseSchema),
            page: z.number(),
            pageSize: z.number(),
            total: z.number()
          })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
      const { status, search, page = 1, pageSize = 20 } = request.query as {
        status?: 'ACTIVE' | 'ARCHIVED';
        search?: string;
        page?: number;
        pageSize?: number;
      };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const where: Prisma.ObjectiveWhereInput = {
          orgId: ctx.orgId,
          ...(status === 'ARCHIVED'
            ? { archivedAt: { not: null } }
            : status === 'ACTIVE'
              ? { archivedAt: null }
              : {})
        };

        if (search) {
          where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } }
          ];
        }

        const [total, items] = await Promise.all([
          tx.objective.count({ where }),
          tx.objective.findMany({
            where,
            include: {
              segments: {
                include: { values: true }
              }
            },
            orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
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
  app.post(
    '/objectives',
    {
      schema: {
        body: createObjectiveSchema.shape.body,
        response: {
          201: z.object({ id: z.string().uuid() })
        }
      }
    },
    async (request, reply) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const payload = request.body;

      if (payload.startDate > payload.endDate) {
        throw app.httpErrors.badRequest('startDate must be before endDate');
      }

      const result = await request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const currentCount = await tx.objective.count({
          where: { orgId: ctx.orgId }
        });
        await enforceLimitCapacity({
          app,
          tx,
          ctx,
          limitKey: 'objectives',
          currentCount
        });
        const objective = await tx.objective.create({
          data: {
            orgId: ctx.orgId,
            teamId: payload.teamId ?? null,
            title: payload.title,
            description: payload.description,
            cadence: payload.cadence,
            startDate: payload.startDate,
            endDate: payload.endDate,
            status: 'ACTIVE',
            segments: payload.segments
              ? {
                  create: payload.segments.map((segment) => ({
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
              : undefined
          }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'Objective',
          entityId: objective.id,
          action: 'CREATE',
          before: null,
          after: objective
        });

        return { id: objective.id };
      });

      reply.code(201);
      return result;
    }
  );

  app.get(
    '/objectives/:id',
    {
      schema: {
        params: objectiveIdParams,
        response: {
          200: objectiveResponseSchema
        }
      }
    },
    async (request) => {
      const { id } = request.params as { id: string };

      request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const objective = await tx.objective.findFirst({
          where: { id, orgId: ctx.orgId },
          include: {
            segments: {
              include: { values: true }
            }
          }
        });

        if (!objective) {
          throw app.httpErrors.notFound('objective not found');
        }

        return objective;
      });
    }
  );

  app.patch(
    '/objectives/:id',
    {
      schema: {
        params: updateObjectiveSchema.shape.params,
        body: updateObjectiveSchema.shape.body,
        response: {
          200: objectiveResponseSchema
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const { id } = request.params as { id: string };
      const data = request.body;

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const objective = await tx.objective.findFirst({
          where: { id, orgId: ctx.orgId }
        });

        if (!objective) {
          throw app.httpErrors.notFound('objective not found');
        }

        const updated = await tx.objective.update({
          where: { id },
          data: {
            title: data.title ?? undefined,
            description: data.description ?? undefined,
            cadence: data.cadence ?? undefined,
            startDate: data.startDate ?? undefined,
            endDate: data.endDate ?? undefined,
            status: data.status ?? undefined,
            teamId: data.teamId === undefined ? undefined : data.teamId
          },
          include: {
            segments: {
              include: { values: true }
            }
          }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'Objective',
          entityId: updated.id,
          action: 'UPDATE',
          before: objective,
          after: updated
        });

        return updated;
      });
    }
  );

  app.post(
    '/objectives/:id/segments',
    {
      schema: {
        params: objectiveIdParams,
        body: z.object({
          segments: z.array(segmentAxisSchema)
        }),
        response: {
          200: z.object({ id: z.string().uuid(), segments: z.array(segmentAxisSchema) })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const { id } = request.params as { id: string };
      const { segments } = request.body as { segments: Array<z.infer<typeof segmentAxisSchema>> };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const objective = await tx.objective.findFirst({
          where: { id, orgId: ctx.orgId }
        });
        if (!objective) throw app.httpErrors.notFound('objective not found');

        await tx.objectiveSegmentValue.deleteMany({
          where: { axis: { objectiveId: id } }
        });
        await tx.objectiveSegmentAxis.deleteMany({
          where: { objectiveId: id }
        });
        await tx.objective.update({
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
          entity: 'Objective',
          entityId: id,
          action: 'SEGMENTS_UPDATED',
          before: objective,
          after: segments
        });

        return { id, segments };
      });
    }
  );

  app.post(
    '/objectives/:id/complete',
    {
      schema: {
        params: objectiveIdParams,
        response: {
          200: z.object({ id: z.string().uuid(), status: z.string() })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const { id } = request.params as { id: string };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const objective = await tx.objective.findFirst({
          where: { id, orgId: ctx.orgId }
        });
        if (!objective) throw app.httpErrors.notFound('objective not found');

        const updated = await tx.objective.update({
          where: { id },
          data: { status: 'ACTIVE' }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'Objective',
          entityId: updated.id,
          action: 'STATUS_UPDATE',
          before: objective,
          after: updated
        });

        return { id: updated.id, status: updated.status };
      });
    }
  );

  app.post(
    '/objectives/:id/archive',
    {
      schema: {
        params: objectiveIdParams,
        response: {
          200: z.object({ id: z.string().uuid(), archivedAt: z.date().nullable(), status: z.string() })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const { id } = request.params as { id: string };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const objective = await tx.objective.findFirst({
          where: { id, orgId: ctx.orgId }
        });
        if (!objective) throw app.httpErrors.notFound('objective not found');

        const updated = await tx.objective.update({
          where: { id },
          data: {
            status: 'ARCHIVED',
            archivedAt: new Date()
          }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'Objective',
          entityId: id,
          action: 'ARCHIVE',
          before: objective,
          after: updated
        });

        return { id: updated.id, archivedAt: updated.archivedAt, status: updated.status };
      });
    }
  );

  app.post(
    '/objectives/:id/restore',
    {
      schema: {
        params: objectiveIdParams,
        response: {
          200: z.object({ id: z.string().uuid(), archivedAt: z.date().nullable(), status: z.string() })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const { id } = request.params as { id: string };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const objective = await tx.objective.findFirst({
          where: { id, orgId: ctx.orgId }
        });
        if (!objective) throw app.httpErrors.notFound('objective not found');

        const updated = await tx.objective.update({
          where: { id },
          data: {
            status: 'ACTIVE',
            archivedAt: null
          }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'Objective',
          entityId: id,
          action: 'RESTORE',
          before: objective,
          after: updated
        });

        return { id: updated.id, archivedAt: updated.archivedAt, status: updated.status };
      });
    }
  );

  app.delete(
    '/objectives/:id',
    {
      schema: {
        params: objectiveIdParams,
        response: {
          200: z.object({ id: z.string().uuid(), deleted: z.literal(true) })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER']);
      const { id } = request.params as { id: string };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const objective = await tx.objective.findFirst({
          where: { id, orgId: ctx.orgId }
        });
        if (!objective) throw app.httpErrors.notFound('objective not found');

        const indicators = await tx.indicatorDefinition.count({
          where: { objectiveId: id, orgId: ctx.orgId }
        });
        if (indicators > 0) {
          throw app.httpErrors.conflict('objective has indicators; archive instead of delete');
        }

        await tx.objective.delete({
          where: { id }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'Objective',
          entityId: id,
          action: 'DELETE',
          before: objective,
          after: null
        });

        return { id, deleted: true as const };
      });
    }
  );

  app.get(
    '/objectives/:id/indicators',
    {
      schema: {
        params: objectiveIdParams,
        querystring: z
          .object({
            type: z.enum(['KR', 'KPI']).optional()
          })
          .optional(),
        response: {
          200: z.object({
            items: z.array(indicatorDefinitionResponseSchema)
          })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
      const { id } = request.params as { id: string };
      const { type } = (request.query as { type?: 'KR' | 'KPI' }) ?? {};

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const objective = await tx.objective.findFirst({
          where: { id, orgId: ctx.orgId }
        });

        if (!objective) {
          throw app.httpErrors.notFound('objective not found');
        }

        const indicators = await tx.indicatorDefinition.findMany({
          where: {
            orgId: ctx.orgId,
            objectiveId: id,
            ...(type ? { type } : {})
          },
          include: {
            segments: {
              include: { values: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        return {
          items: indicators
        };
      });
    }
  );

  app.post(
    '/kresults',
    {
      schema: {
        body: createIndicatorSchema.shape.body,
        response: {
          201: indicatorResponseSchema
        }
      }
    },
    async (request, reply) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const indicator = await request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const currentCount = await tx.indicatorDefinition.count({
          where: { orgId: ctx.orgId }
        });
        await enforceLimitCapacity({
          app,
          tx,
          ctx,
          limitKey: 'indicators',
          currentCount
        });

        const created = await createIndicatorDefinition(app, tx, {
          orgId: ctx.orgId,
          payload: { ...request.body, type: 'KR' }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'IndicatorDefinition',
          entityId: created.id,
          action: 'CREATE',
          before: null,
          after: created
        });

        return created;
      });

      reply.code(201);
      return indicator;
    }
  );

  app.post(
    '/kpis',
    {
      schema: {
        body: createIndicatorSchema.shape.body,
        response: {
          201: indicatorResponseSchema
        }
      }
    },
    async (request, reply) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const indicator = await request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const currentCount = await tx.indicatorDefinition.count({
          where: { orgId: ctx.orgId }
        });
        await enforceLimitCapacity({
          app,
          tx,
          ctx,
          limitKey: 'indicators',
          currentCount
        });

        const created = await createIndicatorDefinition(app, tx, {
          orgId: ctx.orgId,
          payload: { ...request.body, type: 'KPI' }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'IndicatorDefinition',
          entityId: created.id,
          action: 'CREATE',
          before: null,
          after: created
        });

        return created;
      });

      reply.code(201);
      return indicator;
    }
  );
};

export const createIndicatorDefinition = async (
  app: FastifyInstance,
  tx: PrismaClient,
  {
    orgId,
    payload
  }: {
    orgId: string;
    payload: {
      objectiveId?: string;
      type: 'KR' | 'KPI';
      title: string;
      description: string;
      cadence: z.infer<typeof cadenceEnum>;
      startDate: Date;
      endDate: Date;
      unitCode: string;
      unitCustom?: string;
      direction: 'INCREASE' | 'DECREASE' | 'MAINTAIN';
      segments?: Array<z.infer<typeof segmentAxisSchema>>;
    };
  }
) => {
  if (payload.startDate > payload.endDate) {
    throw app.httpErrors.badRequest('startDate must be before endDate');
  }

  if (payload.type === 'KR' && !payload.objectiveId) {
    throw app.httpErrors.badRequest('KR must be associated with an objective');
  }

  if (payload.objectiveId) {
    const objective = await tx.objective.findFirst({
      where: { id: payload.objectiveId, orgId }
    });
    if (!objective) {
      throw app.httpErrors.notFound('objective not found for indicator');
    }

    if (compareCadence(payload.cadence, objective.cadence) > 0) {
      throw app.httpErrors.badRequest('indicator cadence cannot be coarser than objective cadence');
    }
  }

  const indicator = await tx.indicatorDefinition.create({
    data: {
      orgId,
      objectiveId: payload.objectiveId ?? null,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      cadence: payload.cadence,
      startDate: payload.startDate,
      endDate: payload.endDate,
      unitCode: payload.unitCode,
      unitCustom: payload.unitCustom,
      direction: payload.direction,
      status: 'ACTIVE',
      segments: payload.segments
        ? {
            create: payload.segments.map((segment) => ({
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
        : undefined
    },
    select: {
      id: true,
      orgId: true,
      objectiveId: true,
      type: true,
      title: true,
      description: true,
      cadence: true,
      startDate: true,
      endDate: true,
      unitCode: true,
      unitCustom: true,
      direction: true,
      status: true
    }
  });

  return indicator;
};
