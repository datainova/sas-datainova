import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { TenantContext } from '../app';

type LoadedPlan = {
  tenantId: string;
  plan: {
    id: string;
    name: string;
    limits: Record<string, unknown>;
    features: Record<string, unknown>;
  };
};

const fetchTenantPlan = async (tx: PrismaClient, ctx: TenantContext): Promise<LoadedPlan> => {
  const tenant = ctx.tenantId
    ? await tx.tenant.findFirst({
        where: { id: ctx.tenantId, orgId: ctx.orgId },
        include: { plan: true }
      })
    : await tx.tenant.findFirst({
        where: { orgId: ctx.orgId },
        orderBy: { createdAt: 'asc' },
        include: { plan: true }
      });

  if (!tenant || !tenant.plan) {
    throw new Error('tenant plan not found');
  }

  return {
    tenantId: tenant.id,
    plan: {
      id: tenant.plan.id,
      name: tenant.plan.name,
      limits: tenant.plan.limits as Record<string, unknown>,
      features: tenant.plan.features as Record<string, unknown>
    }
  };
};

export const loadTenantPlan = async (tx: PrismaClient, ctx: TenantContext) => fetchTenantPlan(tx, ctx);

export const enforceLimitCapacity = async (opts: {
  app: FastifyInstance;
  tx: PrismaClient;
  ctx: TenantContext;
  limitKey: string;
  currentCount: number;
  increment?: number;
}) => {
  const { app, tx, ctx, limitKey, currentCount, increment = 1 } = opts;
  const { plan } = await fetchTenantPlan(tx, ctx);
  const rawLimit = plan.limits?.[limitKey];

  if (rawLimit === undefined || rawLimit === null || rawLimit === 'unlimited') {
    return;
  }

  if (typeof rawLimit !== 'number') {
    throw app.httpErrors.internalServerError(`plan limit ${limitKey} is invalid`);
  }

  if (currentCount + increment > rawLimit) {
    throw app.httpErrors.forbidden(`${limitKey} limit reached for plan ${plan.name}`);
  }
};

export const enforceFeatureEnabled = async (opts: {
  app: FastifyInstance;
  tx: PrismaClient;
  ctx: TenantContext;
  featureKey: string;
}) => {
  const { app, tx, ctx, featureKey } = opts;
  const { plan } = await fetchTenantPlan(tx, ctx);
  const enabled = plan.features?.[featureKey];
  if (!enabled) {
    throw app.httpErrors.forbidden(`${featureKey} disabled for plan ${plan.name}`);
  }
};
