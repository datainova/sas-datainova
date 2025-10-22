import { URLSearchParams } from 'node:url';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { prisma } from '@datainova/database';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { generateToken, hashToken, generateState, createPkcePair } from '../../lib/crypto';
import { hashPassword, verifyPassword } from '../../lib/password';
import { recordTelemetryEvent } from '../../utils/telemetry';
import { fetch } from 'undici';
import {
  clearAuthCookies,
  extractRequestMetadata,
  issueSession,
  setAuthCookies,
  type RequestMetadata,
  type SessionOrgContext
} from './session-manager';

type UserWithMemberships = Prisma.UserGetPayload<{
  include: {
    roles: {
      include: {
        organization: {
          select: {
            id: true;
            name: true;
            tenants: {
              select: {
                id: true;
                plan: {
                  select: {
                    name: true;
                  };
                };
              };
              orderBy: {
                createdAt: 'asc';
              };
              take: 1;
            };
          };
        };
      };
    };
  };
}>;

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(256)
  })
});

const signupRequestSchema = z.object({
  body: z.object({
    email: z.string().email()
  })
});

const signupCompleteSchema = z.object({
  body: z.object({
    token: z.string().min(16),
    password: z.string().min(8).max(256)
  })
});

const tokenRefreshSchema = z.object({
  body: z
    .object({
      refreshToken: z.string().min(16).optional(),
      orgId: z.string().uuid().optional()
    })
    .optional()
});

const passwordForgotSchema = z.object({
  body: z.object({
    email: z.string().email()
  })
});

const passwordResetSchema = z.object({
  body: z.object({
    token: z.string().min(16),
    newPassword: z.string().min(8).max(256)
  })
});

const googleCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
  scope: z.string().optional()
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const recordLoginAttempt = async (params: {
  email: string;
  metadata: RequestMetadata;
  success: boolean;
}) => {
  try {
    await prisma.authLoginAttempt.create({
      data: {
        email: params.email,
        ipAddress: params.metadata.ip,
        userAgent: params.metadata.userAgent,
        success: params.success
      }
    });
  } catch (error) {
    // Failing to record a login attempt should not block authentication.
  }
};

const mapMemberships = (user: UserWithMemberships): SessionOrgContext[] => {
  return user.roles.map((role) => {
    const tenant = role.organization.tenants[0];
    return {
      orgId: role.orgId,
      orgName: role.organization.name,
      tenantId: tenant?.id,
      plan: tenant?.plan?.name ?? undefined,
      roles: [role.role]
    };
  });
};

const recordAuthAuditEvent = async (params: {
  orgId?: string;
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) => {
  if (!params.orgId) return;
  try {
    await prisma.auditLog.create({
      data: {
        orgId: params.orgId,
        entity: 'user',
        entityId: params.userId,
        action: params.action,
        before: null,
        after: (params.metadata ?? null) as Prisma.InputJsonValue,
        actorId: params.userId
      }
    });
  } catch (error) {
    // Auditing failures should not interrupt user flows.
  }
};

export const registerAuthRoutes = (app: FastifyInstance) => {
  app.post(
    '/auth/login',
    {
      schema: {
        body: loginSchema.shape.body
      }
    },
    async (request, reply) => {
      const { email, password } = request.body as { email: string; password: string };
      const normalizedEmail = normalizeEmail(email);
      const metadata = extractRequestMetadata(request);

      const windowStart = new Date(Date.now() - 5 * 60 * 1000);
      const attempts = await prisma.authLoginAttempt.count({
        where: {
          createdAt: { gte: windowStart },
          success: false,
          OR: [
            { email: normalizedEmail },
            metadata.ip ? { ipAddress: metadata.ip } : undefined
          ].filter(Boolean) as Prisma.AuthLoginAttemptWhereInput[]
        }
      });

      if (attempts >= 5) {
        void recordTelemetryEvent({
          name: 'login_rate_limited',
          metadata: {
            method: 'password',
            emailHash: hashToken(normalizedEmail),
            ipHash: metadata.ip ? hashToken(metadata.ip) : undefined
          }
        });
        throw app.httpErrors.tooManyRequests('too many attempts');
      }

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: {
          roles: {
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                  tenants: {
                    select: {
                      id: true,
                      plan: {
                        select: {
                          name: true
                        }
                      }
                    },
                    orderBy: { createdAt: 'asc' },
                    take: 1
                  }
                }
              }
            }
          }
        }
      });

      const invalidError = app.httpErrors.unauthorized('Credenciais inválidas. Verifique seu email e senha.');

      if (!user || !user.passwordHash) {
        await recordLoginAttempt({ email: normalizedEmail, metadata, success: false });
        void recordTelemetryEvent({
          name: 'login_failed',
          metadata: {
            method: 'password',
            reason: 'invalid_credentials',
            emailHash: hashToken(normalizedEmail),
            ipHash: metadata.ip ? hashToken(metadata.ip) : undefined
          }
        });
        throw invalidError;
      }

      if (user.status === 'BLOCKED') {
        await recordLoginAttempt({ email: normalizedEmail, metadata, success: false });
        void recordTelemetryEvent({
          name: 'login_failed',
          metadata: {
            method: 'password',
            reason: 'account_blocked',
            emailHash: hashToken(normalizedEmail),
            ipHash: metadata.ip ? hashToken(metadata.ip) : undefined
          }
        });
        throw app.httpErrors.forbidden('Não foi possível entrar agora. Tente novamente.');
      }

      const passwordValid = await verifyPassword(password, user.passwordHash, app.env.AUTH_PASSWORD_PEPPER);
      if (!passwordValid) {
        await recordLoginAttempt({ email: normalizedEmail, metadata, success: false });
        void recordTelemetryEvent({
          name: 'login_failed',
          metadata: {
            method: 'password',
            reason: 'invalid_credentials',
            emailHash: hashToken(normalizedEmail),
            ipHash: metadata.ip ? hashToken(metadata.ip) : undefined
          }
        });
        throw invalidError;
      }

      const memberships = mapMemberships(user);
      if (!memberships.length) {
        await recordLoginAttempt({ email: normalizedEmail, metadata, success: true });
        void recordTelemetryEvent({
          name: 'login_requires_org_setup',
          userId: user.id,
          metadata: {
            method: 'password'
          }
        });
        reply.code(200);
        return {
          accessToken: null,
          user: {
            id: user.id,
            email: user.email,
            status: user.status
          },
          orgs: [],
          requiresOrgSetup: true
        };
      }

      const activeMembership = memberships[0];
      const tokens = await issueSession({
        userId: user.id,
        context: activeMembership,
        metadata,
        env: app.env
      });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date()
        }
      });

      await recordLoginAttempt({ email: normalizedEmail, metadata, success: true });

      setAuthCookies(reply, tokens, app.env);

      void recordTelemetryEvent({
        name: 'login_success',
        userId: user.id,
        orgId: activeMembership.orgId,
        metadata: {
          method: 'password'
        }
      });

      void recordAuthAuditEvent({
        orgId: activeMembership.orgId,
        userId: user.id,
        action: 'USER_LOGIN',
        metadata: {
          ip: metadata.ip,
          userAgent: metadata.userAgent
        }
      });

      return {
        accessToken: tokens.accessToken,
        user: {
          id: user.id,
          email: user.email,
          status: user.status
        },
        orgs: memberships.map(({ orgId, orgName, roles, plan, tenantId }) => ({
          id: orgId,
          name: orgName,
          role: roles[0],
          tenantId: tenantId ?? null,
          plan: plan ?? null
        })),
        activeOrgId: activeMembership.orgId
      };
    }
  );

  app.post(
    '/auth/token',
    {
      schema: {
        body: tokenRefreshSchema.shape.body
      }
    },
    async (request, reply) => {
      const csrfHeader = request.headers['x-csrf-token'];
      const csrfCookie = request.cookies?.csrfToken;
      if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
        throw app.httpErrors.forbidden('invalid csrf token');
      }

      const body = (request.body as { refreshToken?: string; orgId?: string } | undefined) ?? {};
      const providedToken = body.refreshToken ?? request.cookies?.refreshToken;

      if (!providedToken) {
        throw app.httpErrors.unauthorized('refresh token missing');
      }

      const hashed = hashToken(providedToken);
      const stored = await prisma.authRefreshToken.findUnique({
        where: { tokenHash: hashed },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  organization: {
                    select: {
                      id: true,
                      name: true,
                      tenants: {
                        select: {
                          id: true,
                          plan: {
                            select: {
                              name: true
                            }
                          }
                        },
                        orderBy: { createdAt: 'asc' },
                        take: 1
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
        throw app.httpErrors.unauthorized('invalid refresh token');
      }

      const memberships = mapMemberships(stored.user);
      if (!memberships.length) {
        throw app.httpErrors.unauthorized('user has no organizations');
      }

      const requestedOrgId = body.orgId;
      const membership = requestedOrgId
        ? memberships.find((entry) => entry.orgId === requestedOrgId)
        : memberships[0];

      if (!membership) {
        throw app.httpErrors.forbidden('organization not available for user');
      }

      const metadata = extractRequestMetadata(request);
      const tokens = await issueSession({
        userId: stored.userId,
        context: membership,
        metadata,
        env: app.env
      });

      await prisma.$transaction([
        prisma.authRefreshToken.update({
          where: { tokenHash: hashed },
          data: { revokedAt: new Date() }
        }),
        prisma.user.update({
          where: { id: stored.userId },
          data: { lastLoginAt: new Date() }
        })
      ]);

      setAuthCookies(reply, tokens, app.env);

      void recordTelemetryEvent({
        name: 'token_refreshed',
        userId: stored.userId,
        orgId: membership.orgId,
        metadata: {
          method: 'refresh'
        }
      });

      return {
        accessToken: tokens.accessToken
      };
    }
  );

  app.get('/auth/session', async (request) => {
    if (!request.user) {
      throw app.httpErrors.unauthorized('missing access token');
    }

    const fullUser = await prisma.user.findUnique({
      where: { id: request.user.sub },
      include: {
        roles: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                tenants: {
                  select: {
                    id: true,
                    plan: {
                      select: {
                        name: true
                      }
                    }
                  },
                  orderBy: { createdAt: 'asc' },
                  take: 1
                }
              }
            }
          }
        }
      }
    });

    if (!fullUser) {
      throw app.httpErrors.unauthorized('user not found');
    }

    const memberships = mapMemberships(fullUser);
    if (!memberships.length) {
      return {
        user: {
          id: fullUser.id,
          email: fullUser.email,
          status: fullUser.status
        },
        orgs: [],
        activeOrgId: null,
        requiresOrgSetup: true
      };
    }

    const activeOrgId =
      memberships.find((membership) => membership.orgId === request.user?.orgId)?.orgId ??
      memberships[0].orgId;

    return {
      user: {
        id: fullUser.id,
        email: fullUser.email,
        status: fullUser.status
      },
      orgs: memberships.map(({ orgId, orgName, roles, plan, tenantId }) => ({
        id: orgId,
        name: orgName,
        role: roles[0],
        tenantId: tenantId ?? null,
        plan: plan ?? null
      })),
      activeOrgId
    };
  });

  app.post(
    '/auth/logout',
    async (request, reply) => {
      const token = request.cookies?.refreshToken ?? (request.body as { refreshToken?: string } | undefined)?.refreshToken;
      if (token) {
        const hashed = hashToken(token);
        await prisma.authRefreshToken.updateMany({
          where: {
            tokenHash: hashed,
            revokedAt: null
          },
          data: {
            revokedAt: new Date()
          }
        });
      }
      clearAuthCookies(reply);
      void recordTelemetryEvent({
        name: 'logout',
        userId: request.user?.sub,
        orgId: request.user?.orgId,
        metadata: {
          via: token ? 'refresh_token' : 'session_only'
        }
      });
      if (request.user?.orgId && request.user?.sub) {
        void recordAuthAuditEvent({
          orgId: request.user.orgId,
          userId: request.user.sub,
          action: 'USER_LOGOUT',
          metadata: {
            via: token ? 'refresh_token' : 'session_only'
          }
        });
      }
      reply.code(204).send();
    }
  );

  app.post(
    '/auth/signup',
    {
      schema: {
        body: signupRequestSchema.shape.body
      }
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };
      const normalizedEmail = normalizeEmail(email);
      const token = generateToken(48);
      const tokenHash = hashToken(token);

      const expiresAt = new Date(Date.now() + app.env.AUTH_SIGNUP_TOKEN_TTL_MINUTES * 60 * 1000);

      await prisma.$transaction([
        prisma.authSignupToken.deleteMany({
          where: {
            email: normalizedEmail
          }
        }),
        prisma.authSignupToken.create({
          data: {
            email: normalizedEmail,
            tokenHash,
            expiresAt
          }
        })
      ]);

      app.log.info({ hasJobQueue: Boolean(app.jobQueue) }, 'signup publish context');
      const jobId = await app.jobQueue?.send('auth.signup.sendEmail', {
        email: normalizedEmail,
        token,
        expiresAt: expiresAt.toISOString()
      });
      app.log.info({ jobId, queue: 'auth.signup.sendEmail' }, 'signup email job enqueued');

      void recordTelemetryEvent({
        name: 'signup_link_sent',
        metadata: {
          emailHash: hashToken(normalizedEmail)
        }
      });

      reply.code(202);
      return {
        message: 'Se encontrarmos seu email, você receberá um link para finalizar o cadastro.'
      };
    }
  );

  app.get(
    '/auth/signup/confirm',
    async (request, reply) => {
      const token = (request.query as { token?: string }).token;
      if (!token) {
        throw app.httpErrors.badRequest('token is required');
      }

      const record = await prisma.authSignupToken.findUnique({
        where: {
          tokenHash: hashToken(token)
        }
      });

      if (!record) {
        throw app.httpErrors.badRequest('invalid token');
      }

      if (record.usedAt) {
        throw app.httpErrors.gone('token already used');
      }

      if (record.expiresAt < new Date()) {
        throw app.httpErrors.gone('token expired');
      }

      return {
        email: record.email
      };
    }
  );

  app.post(
    '/auth/signup/complete',
    {
      schema: {
        body: signupCompleteSchema.shape.body
      }
    },
    async (request, reply) => {
      const { token, password } = request.body as { token: string; password: string };
      const metadata = extractRequestMetadata(request);
      const tokenHash = hashToken(token);

      const record = await prisma.authSignupToken.findUnique({
        where: { tokenHash }
      });

      if (!record || record.usedAt || record.expiresAt < new Date()) {
        throw app.httpErrors.badRequest('token inválido ou expirado');
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: record.email },
        include: {
          roles: {
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                  tenants: {
                    select: {
                      id: true,
                      plan: {
                        select: { name: true }
                      }
                    },
                    orderBy: { createdAt: 'asc' },
                    take: 1
                  }
                }
              }
            }
          }
        }
      });

      const passwordHash = await hashPassword(password, app.env.AUTH_PASSWORD_PEPPER);

      const user = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const userRecord =
          existingUser ??
          (await tx.user.create({
            data: {
              email: record.email,
              passwordHash,
              emailVerifiedAt: now,
              status: 'ACTIVE'
            }
          }));

        if (existingUser) {
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              passwordHash,
              emailVerifiedAt: existingUser.emailVerifiedAt ?? now
            }
          });
        }

        await tx.authRefreshToken.updateMany({
          where: {
            userId: userRecord.id,
            revokedAt: null
          },
          data: {
            revokedAt: now
          }
        });

        await tx.authSignupToken.update({
          where: { tokenHash },
          data: {
            usedAt: now
          }
        });

        return userRecord;
      });

      const memberships = existingUser ? mapMemberships(existingUser) : [];

      if (!memberships.length) {
        clearAuthCookies(reply);
        void recordTelemetryEvent({
          name: 'signup_completed',
          userId: user.id,
          metadata: {
            requiresOrgSetup: true
          }
        });
        reply.code(201);
        return {
          accessToken: null,
          user: {
            id: user.id,
            email: user.email,
            status: user.status
          },
          requiresOrgSetup: true
        };
      }

      const tokens = await issueSession({
        userId: user.id,
        context: memberships[0],
        metadata,
        env: app.env
      });

      setAuthCookies(reply, tokens, app.env);

      void recordTelemetryEvent({
        name: 'signup_completed',
        userId: user.id,
        orgId: memberships[0].orgId,
        metadata: {
          requiresOrgSetup: false
        }
      });

      void recordAuthAuditEvent({
        orgId: memberships[0].orgId,
        userId: user.id,
        action: 'SIGNUP_COMPLETED',
        metadata: {
          method: 'email',
          ip: metadata.ip,
          userAgent: metadata.userAgent
        }
      });

      reply.code(201);
      return {
        accessToken: tokens.accessToken,
        user: {
          id: user.id,
          email: user.email,
          status: user.status
        }
      };
    }
  );

  app.post(
    '/auth/password/forgot',
    {
      schema: {
        body: passwordForgotSchema.shape.body
      }
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };
      const normalizedEmail = normalizeEmail(email);

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, status: true }
      });

      if (user && user.status === 'ACTIVE') {
        const token = generateToken(48);
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + app.env.AUTH_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

        await prisma.$transaction([
          prisma.authResetToken.deleteMany({
            where: {
              userId: user.id
            }
          }),
          prisma.authResetToken.create({
            data: {
              userId: user.id,
              tokenHash,
              expiresAt
            }
          })
        ]);

        await app.jobQueue?.send('auth.passwordReset.sendEmail', {
          email: normalizedEmail,
          token,
          expiresAt: expiresAt.toISOString()
        });
      }

      void recordTelemetryEvent({
        name: user && user.status === 'ACTIVE' ? 'reset_link_sent' : 'reset_link_skipped',
        userId: user?.id,
        metadata: {
          emailHash: hashToken(normalizedEmail),
          delivered: Boolean(user && user.status === 'ACTIVE')
        }
      });

      reply.code(202);
      return {
        message: 'Se encontrarmos sua conta, enviaremos um link para redefinir a senha.'
      };
    }
  );

  app.get(
    '/auth/password/validate',
    async (request, reply) => {
      const token = (request.query as { token?: string }).token;
      if (!token) {
        throw app.httpErrors.badRequest('token is required');
      }

      const record = await prisma.authResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: { select: { email: true } } }
      });

      if (!record) {
        throw app.httpErrors.badRequest('invalid token');
      }

      if (record.usedAt) {
        throw app.httpErrors.gone('token already used');
      }

      if (record.expiresAt < new Date()) {
        throw app.httpErrors.gone('token expired');
      }

      return {
        email: record.user.email
      };
    }
  );

  app.post(
    '/auth/password/reset',
    {
      schema: {
        body: passwordResetSchema.shape.body
      }
    },
    async (request, reply) => {
      const { token, newPassword } = request.body as { token: string; newPassword: string };
      const metadata = extractRequestMetadata(request);
      const record = await prisma.authResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  organization: {
                    select: {
                      id: true,
                      name: true,
                      tenants: {
                        select: {
                          id: true,
                          plan: {
                            select: { name: true }
                          }
                        },
                        orderBy: { createdAt: 'asc' },
                        take: 1
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!record || record.usedAt || record.expiresAt < new Date()) {
        throw app.httpErrors.badRequest('token inválido ou expirado');
      }

      if (record.user.status !== 'ACTIVE') {
        throw app.httpErrors.forbidden('Conta bloqueada.');
      }

      const passwordHash = await hashPassword(newPassword, app.env.AUTH_PASSWORD_PEPPER);
      await prisma.$transaction(async (tx) => {
        const now = new Date();
        await tx.user.update({
          where: { id: record.userId },
          data: {
            passwordHash,
            emailVerifiedAt: record.user.emailVerifiedAt ?? now
          }
        });

        await tx.authResetToken.update({
          where: { tokenHash: record.tokenHash },
          data: {
            usedAt: now
          }
        });

        await tx.authResetToken.updateMany({
          where: {
            userId: record.userId,
            usedAt: null,
            tokenHash: {
              not: record.tokenHash
            }
          },
          data: {
            usedAt: now
          }
        });

        await tx.authRefreshToken.updateMany({
          where: {
            userId: record.userId,
            revokedAt: null
          },
          data: {
            revokedAt: now
          }
        });
      });

      const memberships = mapMemberships(record.user);
      if (!memberships.length) {
        clearAuthCookies(reply);
        void recordTelemetryEvent({
          name: 'password_reset_completed',
          userId: record.user.id,
          metadata: {
            requiresOrgSetup: true
          }
        });
        return {
          accessToken: null,
          user: {
            id: record.user.id,
            email: record.user.email,
            status: record.user.status
          },
          requiresOrgSetup: true
        };
      }

      const tokens = await issueSession({
        userId: record.userId,
        context: memberships[0],
        metadata,
        env: app.env
      });

      setAuthCookies(reply, tokens, app.env);

      void recordTelemetryEvent({
        name: 'password_reset_completed',
        userId: record.user.id,
        orgId: memberships[0].orgId,
        metadata: {
          requiresOrgSetup: false
        }
      });

      void recordAuthAuditEvent({
        orgId: memberships[0].orgId,
        userId: record.user.id,
        action: 'PASSWORD_RESET',
        metadata: {
          ip: metadata.ip,
          userAgent: metadata.userAgent
        }
      });

      return {
        accessToken: tokens.accessToken
      };
    }
  );

  app.get('/auth/oidc/google/init', async (request, reply) => {
    if (!app.env.GOOGLE_CLIENT_ID || !app.env.GOOGLE_REDIRECT_URI) {
      throw app.httpErrors.serviceUnavailable('google oidc not configured');
    }

    const { verifier, challenge } = createPkcePair();
    const state = generateState();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.authOidcSession.create({
      data: {
        provider: 'google',
        stateHash: hashToken(state),
        codeVerifier: verifier,
        redirectUri: request.headers.origin ?? null,
        expiresAt
      }
    });

    const params = new URLSearchParams({
      client_id: app.env.GOOGLE_CLIENT_ID,
      redirect_uri: app.env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'consent'
    });

    reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get('/auth/oidc/google/callback', async (request, reply) => {
    if (
      !app.env.GOOGLE_CLIENT_ID ||
      !app.env.GOOGLE_CLIENT_SECRET ||
      !app.env.GOOGLE_REDIRECT_URI
    ) {
      throw app.httpErrors.serviceUnavailable('google oidc not configured');
    }

    const parsed = googleCallbackQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw app.httpErrors.badRequest('invalid callback query');
    }

    const { code, state } = parsed.data;
    const stateHash = hashToken(state);
    const oidcSession = await prisma.authOidcSession.findUnique({
      where: { stateHash }
    });

    if (!oidcSession || oidcSession.usedAt || oidcSession.expiresAt < new Date()) {
      throw app.httpErrors.badRequest('invalid or expired state');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: app.env.GOOGLE_CLIENT_ID,
        client_secret: app.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: app.env.GOOGLE_REDIRECT_URI,
        code,
        code_verifier: oidcSession.codeVerifier,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      await prisma.authOidcSession.update({
        where: { stateHash },
        data: { usedAt: new Date() }
      });
      throw app.httpErrors.badRequest('failed to exchange code');
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      id_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    if (!tokenData.access_token) {
      await prisma.authOidcSession.update({
        where: { stateHash },
        data: { usedAt: new Date() }
      });
      throw app.httpErrors.badRequest('missing access_token');
    }

    const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        authorization: `Bearer ${tokenData.access_token}`
      }
    });

    if (!userInfoResponse.ok) {
      await prisma.authOidcSession.update({
        where: { stateHash },
        data: { usedAt: new Date() }
      });
      throw app.httpErrors.badRequest('failed to fetch userinfo');
    }

    const userInfo = (await userInfoResponse.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };

    if (!userInfo.email || !userInfo.email_verified) {
      await prisma.authOidcSession.update({
        where: { stateHash },
        data: { usedAt: new Date() }
      });
      throw app.httpErrors.badRequest('email not verified');
    }

    const normalizedEmail = normalizeEmail(userInfo.email);
    const metadata = extractRequestMetadata(request);

    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {
        emailVerifiedAt: new Date(),
        status: 'ACTIVE'
      },
      create: {
        email: normalizedEmail,
        passwordHash: null,
        emailVerifiedAt: new Date(),
        status: 'ACTIVE'
      }
    });

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        roles: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                tenants: {
                  select: {
                    id: true,
                    plan: {
                      select: { name: true }
                    }
                  },
                  orderBy: { createdAt: 'asc' },
                  take: 1
                }
              }
            }
          }
        }
      }
    });

    await prisma.authOidcSession.update({
      where: { stateHash },
      data: {
        usedAt: new Date()
      }
    });

    if (!fullUser) {
      throw app.httpErrors.internalServerError('failed to load user');
    }

    const memberships = mapMemberships(fullUser);
    if (!memberships.length) {
      clearAuthCookies(reply);
      void recordTelemetryEvent({
        name: 'login_requires_org_setup',
        userId: fullUser.id,
        metadata: {
          method: 'google_oidc'
        }
      });
      return renderOidcResult(reply, app.env.FRONTEND_URL, {
        status: 'requires_org_setup'
      });
    }

    const tokens = await issueSession({
      userId: fullUser.id,
      context: memberships[0],
      metadata,
      env: app.env
    });

    setAuthCookies(reply, tokens, app.env);

    void recordTelemetryEvent({
      name: 'login_success',
      userId: fullUser.id,
      orgId: memberships[0].orgId,
      metadata: {
        method: 'google_oidc'
      }
    });

    void recordAuthAuditEvent({
      orgId: memberships[0].orgId,
      userId: fullUser.id,
      action: 'USER_LOGIN',
      metadata: {
        method: 'google_oidc',
        ip: metadata.ip,
        userAgent: metadata.userAgent
      }
    });

    return renderOidcResult(reply, app.env.FRONTEND_URL, {
      status: 'success',
      accessToken: tokens.accessToken,
      orgId: memberships[0].orgId
    });
  });
};

const renderOidcResult = (
  reply: FastifyReply,
  frontendUrl: string,
  payload: Record<string, unknown>
) => {
  const targetOrigin = new URL(frontendUrl).origin;
  const body = `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Autenticando...</title>
  </head>
  <body>
    <script>
      const data = ${JSON.stringify(payload)};
      const targetOrigin = ${JSON.stringify(targetOrigin)};
      if (window.opener) {
        window.opener.postMessage({ type: 'oidc-result', data }, targetOrigin);
        window.close();
      } else {
        window.location.href = targetOrigin + '/auth/oidc/complete?status=' + encodeURIComponent(data.status ?? 'error');
      }
    </script>
  </body>
</html>`;

  reply
    .header('content-type', 'text/html; charset=utf-8')
    .send(body);
};
