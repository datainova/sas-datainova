import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { TenantContext } from '../../app';
import { z } from 'zod';
import { calculateIndicatorStatus } from '../../utils/indicatorStatus';
import { enforceFeatureEnabled } from '../../utils/plan';
import { recordAudit } from '../../utils/audit';

const agentStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'REVOKED']);

export const registerAgentRoutes = (app: FastifyInstance) => {
  app.get(
    '/agents',
    {
      schema: {
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string().uuid(),
                name: z.string(),
                status: agentStatusSchema,
                version: z.string(),
                lastSeenAt: z.date().nullable()
              })
            )
          })
        }
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        await enforceFeatureEnabled({
          app,
          tx,
          ctx,
          featureKey: 'agent'
        });
        const agents = await tx.agent.findMany({
          where: { orgId: ctx.orgId },
          orderBy: { createdAt: 'desc' }
        });

        return {
          items: agents.map((agent) => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            version: agent.version,
            lastSeenAt: agent.lastSeenAt
          }))
        };
      });
    }
  );

  app.post(
    '/agents/register',
    {
      schema: {
        body: z.object({
          name: z.string().min(3),
          version: z.string().default('1.0.0')
        }),
        response: {
          201: z.object({
            id: z.string().uuid(),
            name: z.string(),
            status: agentStatusSchema,
            version: z.string()
          })
        }
      }
    },
    async (request, reply) => {
      request.requireRoles(['ORG_OWNER']);
      const { name, version } = request.body as { name: string; version: string };

      const result = await request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();

        const tenant = await tx.tenant.findFirst({
          where: { orgId: ctx.orgId },
          select: { id: true }
        });

        if (!tenant) {
          throw app.httpErrors.badRequest('tenant not found for organization');
        }

        const agent = await tx.agent.create({
          data: {
            orgId: ctx.orgId,
            tenantId: tenant.id,
            name,
            version,
            status: 'ACTIVE'
          }
        });

        const response = {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          version: agent.version
        };

        await recordAudit({
          tx,
          ctx,
          entity: 'Agent',
          entityId: agent.id,
          action: 'REGISTER',
          before: null,
          after: response
        });

        return response;
      });

      reply.code(201);
      return result;
    }
  );

  app.patch(
    '/agents/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          status: agentStatusSchema.optional(),
          version: z.string().optional()
        })
      }
    },
    async (request) => {
      request.requireRoles(['ORG_OWNER']);
      const { id } = request.params as { id: string };
      const { status, version } = request.body as { status?: 'ACTIVE' | 'INACTIVE' | 'REVOKED'; version?: string };

      return request.withTenantScope(async (tx) => {
        const ctx = request.getTenantContext();
        const agent = await tx.agent.findFirst({
          where: { id, orgId: ctx.orgId }
        });

        if (!agent) {
          throw app.httpErrors.notFound('agent not found');
        }

        const updated = await tx.agent.update({
          where: { id },
          data: {
            status: status ?? agent.status,
            version: version ?? agent.version
          }
        });

        const response = {
          id: updated.id,
          status: updated.status,
          version: updated.version
        };

        await recordAudit({
          tx,
          ctx,
          entity: 'Agent',
          entityId: updated.id,
          action: 'UPDATE',
          before: agent,
          after: response
        });

        return response;
      });
    }
  );

  app.post(
    '/ingest/indicator-values',
    {
      schema: {
        headers: z.object({
          'x-agent-id': z.string().uuid().optional(),
          'x-agent-signature': z.string().optional()
        }),
        body: z.object({
          batchId: z.string(),
          indicatorId: z.string().uuid(),
          period: z.string(),
          value: z.number(),
          checksum: z.string(),
          segmentKey: z.string().optional(),
          readRows: z.number().int().nonnegative().optional(),
          aggregatedRows: z.number().int().nonnegative().optional()
        }),
        response: {
          202: z.object({
            status: z.enum(['accepted', 'duplicate']),
            indicatorValueId: z.string().uuid().optional(),
            batchId: z.string(),
            version: z.number().optional()
          })
        }
      }
    },
    async (request, reply) => {
      const headers = request.headers as Record<string, string | string[] | undefined>;
      const agentHeader = headers['x-agent-id'];
      const signatureHeader = headers['x-agent-signature'];
      const agentId = Array.isArray(agentHeader) ? agentHeader[0] : agentHeader;
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

      const secret = app.env.AGENT_SIGNING_SECRET;

      if (!agentId) {
        throw app.httpErrors.badRequest('missing x-agent-id header');
      }
      if (!signature) {
        throw app.httpErrors.unauthorized('missing x-agent-signature header');
      }

      const payloadDigest = createHmac('sha256', secret)
        .update(JSON.stringify(request.body))
        .digest('hex');

      if (payloadDigest !== signature) {
        throw app.httpErrors.unauthorized('invalid agent signature');
      }

      const body = request.body as {
        batchId: string;
        indicatorId: string;
        period: string;
        value: number;
        checksum: string;
        segmentKey?: string;
        readRows?: number;
        aggregatedRows?: number;
      };

      const ctx = request.getTenantContext();
      request.requireRoles(['ORG_OWNER', 'MANAGER']);
      const result = await request.withTenantScope(async (tx) =>
        ingestIndicatorValue(app, tx, {
          agentId,
          payload: body,
          ctx
        })
      );

      reply.code(202);
      return result;
    }
  );
};

export const ingestIndicatorValue = async (
  app: FastifyInstance,
  tx: PrismaClient,
  {
    agentId,
    payload,
    ctx
  }: {
    agentId: string;
    payload: {
      batchId: string;
      indicatorId: string;
      period: string;
      value: number;
      checksum: string;
      segmentKey?: string;
      readRows?: number;
      aggregatedRows?: number;
    };
    ctx: TenantContext;
  }
) => {
  await enforceFeatureEnabled({
    app,
    tx,
    ctx,
    featureKey: 'agent'
  });

  const agent = await tx.agent.findFirst({
    where: { id: agentId, orgId: ctx.orgId }
  });
  if (!agent) throw app.httpErrors.notFound('agent not registered for organization');

  const indicator = await tx.indicatorDefinition.findFirst({
    where: { id: payload.indicatorId, orgId: ctx.orgId },
    include: {
      targets: true
    }
  });

  if (!indicator) {
    throw app.httpErrors.notFound('indicator not found');
  }

  const existingBatch = await tx.dataTransferBatch.findUnique({
    where: { id: payload.batchId },
    include: { value: true }
  });

  if (existingBatch) {
    if (existingBatch.checksum !== payload.checksum) {
      throw app.httpErrors.conflict('batch checksum mismatch');
    }
    return {
      status: 'duplicate' as const,
      batchId: payload.batchId,
      indicatorValueId: existingBatch.value?.id,
      version: existingBatch.value?.version
    };
  }

  const latestValue = await tx.indicatorValue.findFirst({
    where: {
      indicatorId: payload.indicatorId,
      period: payload.period,
      segmentKey: payload.segmentKey ?? null
    },
    orderBy: { version: 'desc' }
  });

  const nextVersion = (latestValue?.version ?? 0) + 1;

  const periodTarget =
    indicator.targets.find((target) => target.period === payload.period) ??
    indicator.targets.find((target) => target.period === null);

  const statusCalc = calculateIndicatorStatus({
    direction: indicator.direction,
    value: payload.value,
    targetValue: periodTarget?.targetValue,
    tolerance: periodTarget?.tolerance
  });

  const value = await tx.indicatorValue.create({
    data: {
      indicatorId: payload.indicatorId,
      period: payload.period,
      segmentKey: payload.segmentKey ?? null,
      value: payload.value,
      statusCalc,
      origin: 'AGENT',
      version: nextVersion,
      batchId: payload.batchId
    }
  });

  await tx.dataTransferBatch.create({
    data: {
      id: payload.batchId,
      agentId,
      indicatorId: payload.indicatorId,
      period: payload.period,
      checksum: payload.checksum,
      readRows: payload.readRows ?? 0,
      aggregatedRows: payload.aggregatedRows ?? 1,
      value: {
        connect: { id: value.id }
      }
    }
  });

  await tx.agent.update({
    where: { id: agentId },
    data: { lastSeenAt: new Date() }
  });

  await recordAudit({
    tx,
    ctx,
    entity: 'IndicatorValue',
    entityId: value.id,
    action: 'INGEST',
    before: null,
    after: value
  });

  return {
    status: 'accepted' as const,
    batchId: payload.batchId,
    indicatorValueId: value.id,
    version: value.version
  };
};
