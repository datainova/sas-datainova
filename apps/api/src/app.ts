import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppEnv } from '@datainova/config';
import { prisma } from '@datainova/database';
import type { PrismaClient } from '@prisma/client';
import type { JobQueue } from './plugins/jobQueue';
import { registerHealthRoutes } from './modules/health/health.routes';
import { registerOnboardingRoutes } from './modules/onboarding/onboarding.routes';
import { registerObjectiveRoutes } from './modules/objectives/objective.routes';
import { registerIndicatorRoutes } from './modules/indicators/indicator.routes';
import { registerAgentRoutes } from './modules/agents/agent.routes';
import { registerAlertRoutes } from './modules/alerts/alert.routes';
import { registerCheckinRoutes } from './modules/checkins/checkin.routes';
import { registerBillingRoutes } from './modules/billing/billing.routes';
import { registerMcpRoutes } from './modules/mcp/mcp.routes';
import { registerAuthRoutes } from './modules/auth/auth.routes';
import { authPlugin } from './plugins/auth';

declare module 'fastify' {
  interface FastifyInstance {
    env: AppEnv;
    jobQueue?: JobQueue;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    getTenantContext: () => TenantContext;
    withTenantScope: <T>(cb: (tx: PrismaClient) => Promise<T>) => Promise<T>;
    hasRole: (role: string | string[]) => boolean;
    requireRoles: (roles: string | string[]) => void;
  }
}

export type TenantContext = {
  orgId: string;
  tenantId?: string;
  userId?: string;
  roles: string[];
  plan?: string;
};

export const buildApp = (env: AppEnv) => {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard'
              }
            }
          : undefined
    }
  }).withTypeProvider<import('fastify-type-provider-zod').ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(sensible);
  app.register(cors, {
    origin: true,
    credentials: true
  });
  app.register(rateLimit, {
    max: env.RATE_LIMIT_PER_MIN,
    timeWindow: '1 minute'
  });
  app.register(cookie, {
    hook: 'onRequest'
  });

  app.decorate('env', env);

  app.register(authPlugin, { env });

  app.decorateRequest('getTenantContext', function getTenantContext(): TenantContext {
    const request = this as typeof this & { user?: import('./plugins/auth').AuthUser };

    if (request.user?.orgId) {
      return {
        orgId: request.user.orgId,
        tenantId: request.user.tenantId,
        userId: request.user.sub,
        roles: request.user.roles,
        plan: request.user.plan
      };
    }

    const schema = z.object({
      'x-org-id': z.string().uuid(),
      'x-tenant-id': z.string().uuid().optional(),
      'x-user-id': z.string().uuid().optional(),
      'x-roles': z.string().optional(),
      'x-plan': z.string().optional()
    });

    const normalized = Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value) ? value[0] : value
      ])
    );

    const parsed = schema.safeParse(normalized);
    if (!parsed.success) {
      throw app.httpErrors.unauthorized('missing tenant context');
    }

    const rawRoles = parsed.data['x-roles'];
    return {
      orgId: parsed.data['x-org-id'],
      tenantId: parsed.data['x-tenant-id'],
      userId: parsed.data['x-user-id'],
      roles: rawRoles ? rawRoles.split(',').map((role) => role.trim()).filter(Boolean) : [],
      plan: parsed.data['x-plan']
    };
  });

  app.decorateRequest('withTenantScope', async function withTenantScope<T>(
    callback: (tx: PrismaClient) => Promise<T>
  ) {
    const context = this.getTenantContext();
    const rolesCsv = context.roles.join(',');

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${context.orgId}, true)`;
      if (context.tenantId) {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${context.tenantId}, true)`;
      }
      if (context.userId) {
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${context.userId}, true)`;
      }
      if (rolesCsv) {
        await tx.$executeRaw`SELECT set_config('app.current_roles', ${rolesCsv}, true)`;
      }
      if (context.plan) {
        await tx.$executeRaw`SELECT set_config('app.current_plan', ${context.plan}, true)`;
      }
      return callback(tx);
    });
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  app.decorateRequest('hasRole', function hasRole(role: string | string[]) {
    const ctx = this.getTenantContext();
    const required = Array.isArray(role) ? role : [role];
    return required.some((value) => ctx.roles.includes(value));
  });

  app.decorateRequest('requireRoles', function requireRoles(role: string | string[]) {
    if (!this.hasRole(role)) {
      throw app.httpErrors.forbidden('insufficient role');
    }
  });

  registerHealthRoutes(app);
  registerOnboardingRoutes(app);
  registerObjectiveRoutes(app);
  registerIndicatorRoutes(app);
  registerAgentRoutes(app);
  registerAlertRoutes(app);
  registerCheckinRoutes(app);
  registerBillingRoutes(app);
  registerMcpRoutes(app);
  registerAuthRoutes(app);

  return app;
};
