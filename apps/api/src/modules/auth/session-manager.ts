import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@datainova/database';
import type { AppEnv } from '@datainova/config';
import { generateToken, hashToken } from '../../lib/crypto';
import { createAccessToken } from '../../lib/jwt';

export type RequestMetadata = {
  ip: string | null;
  userAgent: string | null;
};

export type SessionOrgContext = {
  orgId: string;
  orgName?: string;
  tenantId?: string;
  plan?: string;
  roles: string[];
};

export type SessionIssueResult = {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  refreshExpiresAt: Date;
};

export const extractRequestMetadata = (request: FastifyRequest): RequestMetadata => {
  const userAgent = request.headers['user-agent'] ?? null;
  return {
    ip: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : userAgent?.[0]?.slice(0, 512) ?? null
  };
};

export const issueSession = async (params: {
  userId: string;
  context: SessionOrgContext;
  metadata: RequestMetadata;
  env: AppEnv;
}): Promise<SessionIssueResult> => {
  const refreshToken = generateToken(64);
  const refreshExpiresAt = new Date(Date.now() + params.env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.authRefreshToken.create({
    data: {
      userId: params.userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: params.metadata.userAgent,
      ipAddress: params.metadata.ip,
      issuedAt: new Date()
    }
  });

  const accessToken = await createAccessToken(
    {
      sub: params.userId,
      orgId: params.context.orgId,
      tenantId: params.context.tenantId,
      roles: params.context.roles,
      plan: params.context.plan
    },
    {
      env: params.env,
      expiresIn: params.env.AUTH_ACCESS_TOKEN_TTL_SEC
    }
  );

  return {
    accessToken,
    refreshToken,
    csrfToken: generateToken(24),
    refreshExpiresAt
  };
};

export const setAuthCookies = (reply: FastifyReply, tokens: SessionIssueResult, env: AppEnv) => {
  const secure = env.NODE_ENV !== 'development';
  reply.setCookie('refreshToken', tokens.refreshToken, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    expires: tokens.refreshExpiresAt
  });
  reply.setCookie('csrfToken', tokens.csrfToken, {
    path: '/',
    httpOnly: false,
    secure,
    sameSite: 'lax',
    expires: tokens.refreshExpiresAt
  });
};

export const clearAuthCookies = (reply: FastifyReply) => {
  reply.clearCookie('refreshToken', { path: '/' });
  reply.clearCookie('csrfToken', { path: '/' });
};
