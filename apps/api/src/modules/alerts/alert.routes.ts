import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordAudit } from '../../utils/audit';

export const registerAlertRoutes = (app: FastifyInstance) => {
  app.get(
    '/alerts',
    {
      schema: {
        querystring: z.object({
          status: z.enum(['open', 'resolved']).optional()
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string().uuid(),
                entity: z.string(),
                entityId: z.string(),
                type: z.string(),
                severity: z.string(),
                createdAt: z.date(),
                resolvedAt: z.date().nullable()
              })
            )
          })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
      const { status } = request.query as { status?: 'open' | 'resolved' };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const alerts = await tx.alert.findMany({
          where: {
            orgId: ctx.orgId,
            ...(status === 'open' ? { resolvedAt: null } : {}),
            ...(status === 'resolved' ? { NOT: { resolvedAt: null } } : {})
          },
          orderBy: { createdAt: 'desc' }
        });

        return {
          items: alerts.map((alert) => ({
            id: alert.id,
            entity: alert.entity,
            entityId: alert.entityId,
            type: alert.type,
            severity: alert.severity,
            createdAt: alert.createdAt,
            resolvedAt: alert.resolvedAt
          }))
        };
      });
    }
  );

  app.post(
    '/alerts/ack',
    {
      schema: {
        body: z.object({
          alertId: z.string().uuid()
        }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            resolvedAt: z.date()
          })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const { alertId } = request.body as { alertId: string };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const alert = await tx.alert.findFirst({
          where: { id: alertId, orgId: ctx.orgId }
        });
        if (!alert) throw app.httpErrors.notFound('alert not found');

        const resolvedAt = new Date();

        const updated = await tx.alert.update({
          where: { id: alertId },
          data: { resolvedAt }
        });

        await recordAudit({
          tx,
          ctx,
          entity: 'Alert',
          entityId: alertId,
          action: 'ACK',
          before: alert,
          after: updated
        });

        return { id: alertId, resolvedAt };
      });
    }
  );
};
