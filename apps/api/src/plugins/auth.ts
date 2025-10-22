import { createPublicKey } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { jwtVerify } from 'jose';
import type { AppEnv } from '@datainova/config';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export type AuthUser = {
  sub: string;
  orgId: string;
  tenantId?: string;
  roles: string[];
  plan?: string;
};

type AuthPluginOptions = {
  env: AppEnv;
};

export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  const publicKey = createPublicKey(opts.env.JWT_PUBLIC_KEY);

  app.decorateRequest('user', null);

  app.addHook('preHandler', async (request) => {
    const authorization = request.headers.authorization;
    if (!authorization) return;

    const [scheme, token] = authorization.split(' ');
    if (!token || scheme.toLowerCase() !== 'bearer') {
      throw app.httpErrors.unauthorized('invalid authorization header');
    }

    try {
      const { payload } = await jwtVerify(token, publicKey, {
        issuer: opts.env.JWT_ISSUER
      });

      const orgId = (payload.org_id ?? payload.orgId) as string | undefined;
      if (!orgId) {
        throw app.httpErrors.unauthorized('token missing org_id');
      }

      const roles = Array.isArray(payload.roles)
        ? (payload.roles as string[])
        : typeof payload.role === 'string'
          ? [payload.role]
          : [];

      request.user = {
        sub: payload.sub as string,
        orgId,
        tenantId: (payload.tenant_id ?? payload.tenantId) as string | undefined,
        roles,
        plan: payload.plan as string | undefined
      };
    } catch (error) {
      app.log.warn({ err: error }, 'token verification failed');
      throw app.httpErrors.unauthorized('invalid token');
    }
  });
};
