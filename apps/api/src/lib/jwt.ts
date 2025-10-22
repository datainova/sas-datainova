import { createPrivateKey } from 'node:crypto';
import { SignJWT } from 'jose';
import type { AppEnv } from '@datainova/config';

export type AccessTokenPayload = {
  sub: string;
  orgId: string;
  tenantId?: string | null;
  roles: string[];
  plan?: string | null;
};

type AccessTokenOptions = {
  env: AppEnv;
  expiresIn: number;
};

export const createAccessToken = async (payload: AccessTokenPayload, options: AccessTokenOptions) => {
  const privateKey = createPrivateKey(options.env.JWT_PRIVATE_KEY);

  return new SignJWT({
    org_id: payload.orgId,
    tenant_id: payload.tenantId ?? undefined,
    roles: payload.roles,
    plan: payload.plan ?? undefined
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuer(options.env.JWT_ISSUER)
    .setAudience(payload.orgId)
    .setIssuedAt()
    .setExpirationTime(`${options.expiresIn}s`)
    .sign(privateKey);
};
