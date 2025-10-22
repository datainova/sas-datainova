import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '@datainova/database';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { extractRequestMetadata, issueSession, setAuthCookies } from '../auth/session-manager';

const createSessionSchema = z.object({
  body: z.object({
    orgName: z.string().min(2),
    email: z.string().email().optional(),
    userId: z.string().uuid().optional()
  })
});

const stepSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    step: z.string().min(1),
    payload: z.any()
  })
});

const completeSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  })
});

type OnboardingSteps = Record<string, unknown>;

const getSessionSteps = (data: Prisma.JsonValue | null | undefined): OnboardingSteps => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  const steps = (data as Record<string, unknown>).steps;
  if (!steps || typeof steps !== 'object' || Array.isArray(steps)) {
    return {};
  }
  return steps as OnboardingSteps;
};

const mergeStepPayload = (
  current: Prisma.JsonValue | null | undefined,
  step: string,
  payload: unknown
): Prisma.JsonObject => {
  const root =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Prisma.JsonObject)
      : ({ steps: {} } as Prisma.JsonObject);

  const steps = getSessionSteps(root);

  return {
    ...root,
    steps: {
      ...steps,
      [step]: payload
    }
  };
};

const coerceValue = (steps: OnboardingSteps, key: string): string | undefined => {
  const entry = steps[key];
  if (entry === undefined || entry === null) return undefined;
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && !Array.isArray(entry)) {
    if ('value' in entry && typeof (entry as Record<string, unknown>).value === 'string') {
      return (entry as Record<string, string>).value;
    }
    if ('text' in entry && typeof (entry as Record<string, unknown>).text === 'string') {
      return (entry as Record<string, string>).text;
    }
  }
  return String(entry);
};

export const registerOnboardingRoutes = (app: FastifyInstance) => {
  app.post(
    '/onboarding/sessions',
    {
      schema: {
        body: createSessionSchema.shape.body,
        response: {
          201: z.object({ sessionId: z.string().uuid() })
        }
      }
    },
    async (request, reply) => {
      const { orgName, email, userId } = request.body as { orgName: string; email?: string; userId?: string };
      const sessionId = randomUUID();

      const sessionData: Prisma.InputJsonObject = {
        orgName,
        steps: {}
      };

      if (userId) {
        sessionData.userId = userId;
      }

      await prisma.onboardingSession.create({
        data: {
          id: sessionId,
          email,
          data: sessionData
        }
      });

      reply.code(201);
      return { sessionId };
    }
  );

  app.patch(
    '/onboarding/sessions/:id/step',
    {
      schema: {
        params: stepSchema.shape.params,
        body: stepSchema.shape.body
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { step, payload } = request.body as { step: string; payload: unknown };

      const session = await prisma.onboardingSession.findUnique({
        where: { id }
      });

      if (!session) {
        throw app.httpErrors.notFound('session not found');
      }

      await prisma.onboardingSession.update({
        where: { id },
        data: {
          data: mergeStepPayload(session.data, step, payload),
          updatedAt: new Date()
        }
      });

      reply.code(204).send();
    }
  );

  app.post(
    '/onboarding/sessions/:id/complete',
    {
      schema: {
        params: completeSchema.shape.params,
        response: {
          200: z.object({
            status: z.literal('completed'),
            organizationId: z.string().uuid(),
            tenantId: z.string().uuid(),
            accessToken: z.string().nullable()
          })
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const session = await prisma.onboardingSession.findUnique({
        where: { id }
      });

      if (!session) {
        throw app.httpErrors.notFound('session not found');
      }

      const sessionData =
        session.data && typeof session.data === 'object' && !Array.isArray(session.data)
          ? (session.data as Record<string, unknown>)
          : {};

      const sessionDraftOrgName =
        sessionData.orgName !== undefined && sessionData.orgName !== null
          ? String(sessionData.orgName)
          : undefined;

      const sessionUserId =
        typeof sessionData.userId === 'string' ? (sessionData.userId as string) : undefined;

      let user =
        sessionUserId !== undefined
          ? await prisma.user.findUnique({
              where: { id: sessionUserId }
            })
          : null;

      if (!user && session.email) {
        user = await prisma.user.findUnique({
          where: { email: session.email }
        });
      }

      const metadata = extractRequestMetadata(request);

      if (session.status === 'completed' && session.orgId) {
        const tenant = await prisma.tenant.findFirst({
          where: { orgId: session.orgId },
          select: {
            id: true,
            plan: {
              select: { name: true }
            }
          }
        });

        let accessToken: string | null = null;
        if (user && tenant) {
          await prisma.userRole.upsert({
            where: {
              userId_orgId: {
                userId: user.id,
                orgId: session.orgId
              }
            },
            update: {
              role: 'ORG_OWNER'
            },
            create: {
              id: randomUUID(),
              userId: user.id,
              orgId: session.orgId,
              role: 'ORG_OWNER'
            }
          });

          const tokens = await issueSession({
            userId: user.id,
            context: {
              orgId: session.orgId,
              tenantId: tenant.id,
              plan: tenant.plan?.name,
              roles: ['ORG_OWNER']
            },
            metadata: extractRequestMetadata(request),
            env: app.env
          });

          setAuthCookies(reply, tokens, app.env);
          accessToken = tokens.accessToken;
        }

        return {
          status: 'completed' as const,
          organizationId: session.orgId,
          tenantId: tenant?.id ?? session.orgId,
          accessToken
        };
      }

      const steps = getSessionSteps(session.data);

      const orgName = coerceValue(steps, 'name') ?? sessionDraftOrgName ?? 'Organização';
      const country = (coerceValue(steps, 'country') ?? 'BR').toUpperCase();
      const segment = coerceValue(steps, 'segment') ?? 'GENERAL';
      const size = coerceValue(steps, 'size') ?? 'UNKNOWN';
      const mission = coerceValue(steps, 'mission');
      const vision = coerceValue(steps, 'vision');

      const plan = await prisma.plan.findUnique({
        where: { name: 'FREE' }
      });

      if (!plan) {
        throw app.httpErrors.internalServerError('no default plan seeded');
      }

      const organization = await prisma.organization.create({
        data: {
          name: orgName,
          countryIso: country,
          segmentCode: segment,
          sizeBucket: size,
          mission,
          vision
        }
      });

      const tenant = await prisma.tenant.create({
        data: {
          orgId: organization.id,
          planId: plan.id,
          timezone: 'UTC',
          currency: country === 'BR' ? 'BRL' : 'USD',
          locale: country === 'BR' ? 'pt-BR' : 'en-US',
          status: 'ACTIVE'
        }
      });

      if (user) {
        await prisma.userRole.upsert({
          where: {
            userId_orgId: {
              userId: user.id,
              orgId: organization.id
            }
          },
          update: {
            role: 'ORG_OWNER'
          },
          create: {
            id: randomUUID(),
            userId: user.id,
            orgId: organization.id,
            role: 'ORG_OWNER'
          }
        });
      }

      let accessToken: string | null = null;

      if (user) {
        const tokens = await issueSession({
          userId: user.id,
          context: {
            orgId: organization.id,
            tenantId: tenant.id,
            plan: plan.name,
            roles: ['ORG_OWNER']
          },
          metadata,
          env: app.env
        });
        setAuthCookies(reply, tokens, app.env);
        accessToken = tokens.accessToken;
      }

      if (session.email) {
        await prisma.lead.create({
          data: {
            email: session.email,
            source: 'onboarding',
            lifecycle: 'customer',
            metadata: {
              organizationId: organization.id,
              sessionId: session.id
            }
          }
        });
      }

      await prisma.onboardingSession.update({
        where: { id },
        data: {
          orgId: organization.id,
          status: 'completed',
          data: {
            ...mergeStepPayload(session.data, 'completedAt', new Date().toISOString()),
            organizationId: organization.id,
            tenantId: tenant.id
          },
          updatedAt: new Date()
        }
      });

      return {
        status: 'completed' as const,
        organizationId: organization.id,
        tenantId: tenant.id,
        accessToken
      };
    }
  );
};
