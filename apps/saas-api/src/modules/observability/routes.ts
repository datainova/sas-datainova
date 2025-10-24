import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

const readyResponseSchema = z.object({
  status: z.literal("ready"),
});

const metricsResponseSchema = z.string();

export const observabilityRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();

  router.get(
    "/health",
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async (_request, reply) => reply.send({ status: "ok" })
  );

  router.get(
    "/ready",
    {
      schema: {
        response: {
          200: readyResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      await fastify.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      return reply.send({ status: "ready" });
    }
  );

  router.get(
    "/metrics",
    {
      schema: {
        response: {
          200: metricsResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      reply.type("text/plain");
      return reply.send("# metrics\n");
    }
  );

};
