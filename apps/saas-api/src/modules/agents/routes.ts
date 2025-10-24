import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { AgentStatus, RoleType } from "@prisma/client";
import { z } from "zod";
import { randomBytes } from "crypto";
import { createHash } from "crypto";
import { sendProblem } from "@/http/problem";

const agentsQuerySchema = z.object({
  status: z.nativeEnum(AgentStatus).optional(),
});

const agentResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.nativeEnum(AgentStatus),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
});

const agentsResponseSchema = z.object({
  items: z.array(agentResponseSchema),
});

const registerBodySchema = z.object({
  name: z.string().min(1).max(120),
});

const registerResponseSchema = z.object({
  agent_id: z.string().uuid(),
  agent_secret: z.string(),
});

const rotateResponseSchema = z.object({
  agent_id: z.string().uuid(),
  agent_secret: z.string(),
});

const okResponseSchema = z.object({
  ok: z.boolean(),
});

const requireAdmin = (role: RoleType) =>
  role === RoleType.OWNER || role === RoleType.ADMIN;

const generateSecret = () => randomBytes(32).toString("hex");
const hashSecret = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();
    router.get(
    "/agents",
    {
      preHandler: fastify.authenticate,
      schema: {
        querystring: agentsQuerySchema,
        response: {
          200: agentsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { status } = request.query;

      const agents = await fastify.withTenant(tenantId, (tx) =>
        tx.agent.findMany({
          where: {
            ...(status ? { status } : {}),
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      );

      return reply.send({
        items: agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          status: agent.status,
          lastSeenAt: agent.lastSeenAt
            ? agent.lastSeenAt.toISOString()
            : null,
          createdAt: agent.createdAt.toISOString(),
        })),
      });
    }
  );

  router.post(
    "/agents/register",
    {
      preHandler: fastify.authenticate,
      schema: {
        body: registerBodySchema,
        response: {
          201: registerResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const role = request.authUser!.role;

      if (!requireAdmin(role)) {
        return sendProblem(reply, request, {
          status: 403,
          code: "E_AGENT_FORBIDDEN",
          detail: "Only admins or owners can register agents.",
        });
      }

      const secret = generateSecret();
      const agent = await fastify.withTenant(tenantId, (tx) =>
        tx.agent.create({
          data: {
            organizationId: tenantId,
            name: request.body.name,
            status: AgentStatus.ACTIVE,
            secretHash: hashSecret(secret),
          },
        })
      );

      return reply.status(201).send({
        agent_id: agent.id,
        agent_secret: secret,
      });
    }
  );

  router.post(
    "/agents/:id/rotate-secret",
    {
      preHandler: fastify.authenticate,
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: rotateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const role = request.authUser!.role;

      if (!requireAdmin(role)) {
        return sendProblem(reply, request, {
          status: 403,
          code: "E_AGENT_FORBIDDEN",
          detail: "Only admins or owners can rotate secrets.",
        });
      }

      const secret = generateSecret();

      const agent = await fastify.withTenant(tenantId, (tx) =>
        tx.agent.update({
          where: { id: request.params.id },
          data: {
            secretHash: hashSecret(secret),
            status: AgentStatus.ACTIVE,
          },
        })
      );

      return reply.send({
        agent_id: agent.id,
        agent_secret: secret,
      });
    }
  );

  router.post(
    "/agents/:id/revoke",
    {
      preHandler: fastify.authenticate,
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: okResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const role = request.authUser!.role;

      if (!requireAdmin(role)) {
        return sendProblem(reply, request, {
          status: 403,
          code: "E_AGENT_FORBIDDEN",
          detail: "Only admins or owners can revoke agents.",
        });
      }

      await fastify.withTenant(tenantId, (tx) =>
        tx.agent.update({
          where: { id: request.params.id },
          data: {
            status: AgentStatus.REVOKED,
          },
        })
      );

      return reply.send({ ok: true });
    }
  );
};
