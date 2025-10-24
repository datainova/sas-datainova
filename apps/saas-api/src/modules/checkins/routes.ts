import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { sendProblem } from "@/http/problem";
import { decodeCursor, encodeCursor } from "@/lib/pagination";

const checkinsQuerySchema = z.object({
  objectiveId: z.string().uuid().optional(),
  indicatorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const checkinResponseSchema = z.object({
  id: z.string().uuid(),
  indicatorId: z.string().uuid().nullable(),
  note: z.string().nullable(),
  createdBy: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
  }),
  createdAt: z.string(),
});

const checkinsResponseSchema = z.object({
  items: z.array(checkinResponseSchema),
  page: z.object({
    size: z.number(),
    next: z.string().nullable(),
  }),
});

const checkinBodySchema = z.object({
  indicatorId: z.string().uuid().optional(),
  summary: z.string().min(1).max(2000),
});

export const checkinRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();
    router.get(
    "/checkins",
    {
      preHandler: fastify.authenticate,
      schema: {
        querystring: checkinsQuerySchema,
        response: {
          200: checkinsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { objectiveId, indicatorId, from, to, limit, cursor } =
        request.query;
      const decodedCursor = decodeCursor(cursor);

      const checkins = (await fastify.withTenant(tenantId, (tx) =>
        tx.checkin.findMany({
          where: {
            ...(indicatorId ? { indicatorId } : {}),
            ...(from || to
              ? {
                  createdAt: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                  },
                }
              : {}),
            ...(objectiveId
              ? {
                  indicator: {
                    objectiveId,
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
          include: {
            user: true,
          },
          take: limit + 1,
        })
      )) as Prisma.CheckinGetPayload<{ include: { user: true } }>[];

      let nextCursor: string | null = null;
      if (checkins.length > limit) {
        const last = checkins.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.createdAt.toISOString(),
        });
      }

      return reply.send({
        items: checkins.map((checkin) => ({
          id: checkin.id,
          indicatorId: checkin.indicatorId,
          note: checkin.note,
          createdBy: {
            id: checkin.userId,
            email: checkin.user.email,
            name: checkin.user.name,
          },
          createdAt: checkin.createdAt.toISOString(),
        })),
        page: {
          size: limit,
          next: nextCursor,
        },
      });
    }
  );

  router.post(
    "/checkins",
    {
      preHandler: fastify.authenticate,
      schema: {
        body: checkinBodySchema,
        response: {
          201: checkinResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const userId = request.authUser!.id;
      const { indicatorId, summary } = request.body;

      if (indicatorId) {
        const indicatorExists = await fastify.withTenant(tenantId, (tx) =>
          tx.indicatorDefinition.findUnique({ where: { id: indicatorId } })
        );
        if (!indicatorExists) {
          return sendProblem(reply, request, {
            status: 400,
            code: "E_CHECKIN_INDICATOR_NOT_FOUND",
            detail: "Indicator not found.",
          });
        }
      }

      const checkin = (await fastify.withTenant(tenantId, (tx) =>
        tx.checkin.create({
          data: {
            organizationId: tenantId,
            indicatorId: indicatorId ?? null,
            userId,
            note: summary,
          },
          include: {
            user: true,
          },
        })
      )) as Prisma.CheckinGetPayload<{ include: { user: true } }>;

      return reply.status(201).send({
        id: checkin.id,
        indicatorId: checkin.indicatorId,
        note: checkin.note,
        createdBy: {
          id: checkin.userId,
          email: checkin.user.email,
          name: checkin.user.name,
        },
        createdAt: checkin.createdAt.toISOString(),
      });
    }
  );
};
