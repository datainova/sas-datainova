import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { WebhookSource, Prisma } from "@prisma/client";
import { z } from "zod";
import { sendProblem } from "@/http/problem";

const stripeWebhookSchema = z.object({
  id: z.string().min(1),
  type: z.string().optional(),
});

const hubspotWebhookSchema = z.object({
  source: z.string().min(1),
  external_id: z.string().min(1),
  payload: z.record(z.string(), z.any()).optional(),
});

const okResponseSchema = z.object({
  ok: z.boolean(),
});

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();
    router.post(
    "/webhooks/stripe",
    {
      schema: {
        body: stripeWebhookSchema,
        response: {
          200: okResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const payload = request.body;

      try {
        await fastify.prisma.webhookEvent.create({
          data: {
            source: WebhookSource.STRIPE,
            externalId: payload.id,
            payload: payload as Prisma.JsonObject,
            status: "pending",
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return sendProblem(reply, request, {
            status: 409,
            code: "E_WEBHOOK_DUPLICATE",
            detail: "Event already processed.",
          });
        }
        throw error;
      }

      return reply.send({ ok: true });
    }
  );

  router.post(
    "/webhooks/hubspot",
    {
      schema: {
        body: hubspotWebhookSchema,
        response: {
          200: okResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { source, external_id, payload } = request.body;

      try {
        await fastify.prisma.webhookEvent.create({
          data: {
            source: WebhookSource.HUBSPOT,
            externalId: `${source}:${external_id}`,
            payload: payload as Prisma.JsonObject,
            status: "pending",
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return sendProblem(reply, request, {
            status: 409,
            code: "E_WEBHOOK_DUPLICATE",
            detail: "Event already processed.",
          });
        }
        throw error;
      }

      return reply.send({ ok: true });
    }
  );
};