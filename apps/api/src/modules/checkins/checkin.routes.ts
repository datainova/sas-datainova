import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordAudit } from '../../utils/audit';

const checkinCreateSchema = z.object({
  body: z.object({
    objectiveId: z.string().uuid(),
    indicatorId: z.string().uuid().optional(),
    cadence: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
    notes: z.string().optional(),
    status: z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']),
    learnings: z.string().optional()
  })
});

export const registerCheckinRoutes = (app: FastifyInstance) => {
  app.post(
    '/checkins',
    {
      schema: {
        body: checkinCreateSchema.shape.body,
        response: {
          201: z.object({
            id: z.string().uuid(),
            objectiveId: z.string().uuid(),
            indicatorId: z.string().uuid().nullable(),
            status: z.string(),
            cadence: z.string(),
            notes: z.string().nullable(),
            learnings: z.string().nullable(),
            createdAt: z.date()
          })
        }
      }
    },
    async (request, reply) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR']);
      const payload = request.body as {
        objectiveId: string;
        indicatorId?: string;
        cadence: string;
        notes?: string;
        status: string;
        learnings?: string;
      };

      const created = await request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();

        const objective = await tx.objective.findFirst({
          where: { id: payload.objectiveId, orgId: ctx.orgId }
        });
        if (!objective) throw app.httpErrors.notFound('objective not found');

        if (payload.indicatorId) {
          const indicator = await tx.indicatorDefinition.findFirst({
            where: { id: payload.indicatorId, orgId: ctx.orgId }
          });
          if (!indicator) {
            throw app.httpErrors.notFound('indicator not found');
          }
        }

        const checkin = await tx.checkin.create({
          data: {
            orgId: ctx.orgId,
            objectiveId: payload.objectiveId,
            indicatorId: payload.indicatorId ?? null,
            cadence: payload.cadence,
            status: payload.status,
            notes: payload.notes ?? null,
            learnings: payload.learnings ?? null
          }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'Checkin',
          entityId: checkin.id,
          action: 'CREATE',
          before: null,
          after: checkin
        });

        return checkin;
      });

      reply.code(201);
      return {
        id: created.id,
        objectiveId: created.objectiveId,
        indicatorId: created.indicatorId,
        status: created.status,
        cadence: created.cadence,
        notes: created.notes,
        learnings: created.learnings,
        createdAt: created.createdAt
      };
    }
  );

  app.get(
    '/checkins',
    {
      schema: {
        querystring: z.object({
          objectiveId: z.string().uuid()
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string().uuid(),
                objectiveId: z.string().uuid(),
                indicatorId: z.string().uuid().nullable(),
                status: z.string(),
                cadence: z.string(),
                notes: z.string().nullable(),
                learnings: z.string().nullable(),
                createdAt: z.date()
              })
            )
          })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
      const { objectiveId } = request.query as { objectiveId: string };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const objective = await tx.objective.findFirst({
          where: { id: objectiveId, orgId: ctx.orgId },
          select: { id: true }
        });
        if (!objective) throw app.httpErrors.notFound('objective not found');

        const items = await tx.checkin.findMany({
          where: {
            orgId: ctx.orgId,
            objectiveId
          },
          orderBy: { createdAt: 'desc' }
        });

        return {
          items: items.map((item) => ({
            id: item.id,
            objectiveId: item.objectiveId,
            indicatorId: item.indicatorId,
            status: item.status,
            cadence: item.cadence,
            notes: item.notes,
            learnings: item.learnings,
            createdAt: item.createdAt
          }))
        };
      });
    }
  );
};
