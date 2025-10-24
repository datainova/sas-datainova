import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { AlertSeverity, Prisma } from "@prisma/client";
import { z } from "zod";
import { sendProblem } from "@/http/problem";
import { decodeCursor, encodeCursor } from "@/lib/pagination";

const alertsQuerySchema = z.object({
  severity: z.nativeEnum(AlertSeverity).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const alertResponseSchema = z.object({
  id: z.string().uuid(),
  indicatorId: z.string().uuid().nullable(),
  severity: z.nativeEnum(AlertSeverity),
  kind: z.string(),
  message: z.string(),
  context: z.record(z.string(), z.any()).nullable(),
  createdAt: z.string(),
});

const alertsResponseSchema = z.object({
  items: z.array(alertResponseSchema),
  page: z.object({
    size: z.number(),
    next: z.string().nullable(),
  }),
});

const ackBodySchema = z.object({
  alert_id: z.string().uuid(),
  comment: z.string().max(500).optional(),
});

const ackResponseSchema = z.object({
  ok: z.boolean(),
});

export const alertRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();
    router.get(
    "/alerts",
    {
      preHandler: fastify.authenticate,
      schema: {
        querystring: alertsQuerySchema,
        response: {
          200: alertsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { severity, from, to, limit, cursor } = request.query;
      const decodedCursor = decodeCursor(cursor);

      const alerts = await fastify.withTenant(tenantId, (tx) =>
        tx.alertEvent.findMany({
          where: {
            ...(severity ? { severity } : {}),
            ...(from || to
              ? {
                  createdAt: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                  },
                }
              : {}),
            ...(decodedCursor
              ? {
                  OR: [
                    {
                      createdAt: {
                        lt: new Date(decodedCursor.createdAt),
                      },
                    },
                    {
                      AND: [
                        {
                          createdAt: {
                            equals: new Date(decodedCursor.createdAt),
                          },
                        },
                        { id: { lt: decodedCursor.id } },
                      ],
                    },
                  ],
                }
              : {}),
          },
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
          take: limit + 1,
        })
      );

      let nextCursor: string | null = null;
      if (alerts.length > limit) {
        const last = alerts.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.createdAt.toISOString(),
        });
      }

      return reply.send({
        items: alerts.map((alert) => ({
          id: alert.id,
          indicatorId: alert.indicatorId,
          severity: alert.severity,
          kind: alert.kind,
          message: alert.message,
          context: (alert.context as Record<string, unknown>) ?? null,
          createdAt: alert.createdAt.toISOString(),
        })),
        page: {
          size: limit,
          next: nextCursor,
        },
      });
    }
  );

  router.post(
    "/alerts/ack",
    {
      preHandler: fastify.authenticate,
      schema: {
        body: ackBodySchema,
        response: {
          200: ackResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { alert_id, comment } = request.body;

      const alert = await fastify.withTenant(tenantId, (tx) =>
        tx.alertEvent.findUnique({ where: { id: alert_id } })
      );

      if (!alert) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_ALERT_NOT_FOUND",
          detail: "Alert not found.",
        });
      }

      await fastify.withTenant(tenantId, (tx) =>
        tx.auditLog.create({
          data: {
            organizationId: tenantId,
            actor: request.authUser?.id ?? "system",
            action: "ALERT_ACK",
            entity: "alert_event",
            entityId: alert_id,
            diff: comment ? { comment } : Prisma.JsonNull,
            requestId: request.id,
            traceId: (request.headers["traceparent"] as string) ?? null,
          },
        })
      );

      return reply.send({ ok: true });
    }
  );
};
