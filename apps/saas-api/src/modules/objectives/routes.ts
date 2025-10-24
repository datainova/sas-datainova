import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { sendProblem } from "@/http/problem";
import { decodeCursor, encodeCursor } from "@/lib/pagination";

const objectivesQuerySchema = z.object({
  updatedSince: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const objectiveBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  ownerId: z.string().uuid().nullable().optional(),
});

const objectiveResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  ownerId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const objectivesResponseSchema = z.object({
  items: z.array(objectiveResponseSchema),
  page: z.object({
    size: z.number(),
    next: z.string().nullable(),
  }),
});

export const objectiveRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();
    router.get(
    "/objectives",
    {
      preHandler: fastify.authenticate,
      schema: {
        querystring: objectivesQuerySchema,
        response: {
          200: objectivesResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { updatedSince, limit, cursor } = request.query;
      const decodedCursor = decodeCursor(cursor);

      const objectives = await fastify.withTenant(tenantId, (tx) =>
        tx.objective.findMany({
          where: {
            ...(updatedSince
              ? {
                  updatedAt: {
                    gte: new Date(updatedSince),
                  },
                }
              : {}),
            ...(decodedCursor
              ? {
                  OR: [
                    {
                      updatedAt: {
                        lt: new Date(decodedCursor.createdAt),
                      },
                    },
                    {
                      AND: [
                        {
                          updatedAt: {
                            equals: new Date(decodedCursor.createdAt),
                          },
                        },
                        {
                          id: {
                            lt: decodedCursor.id,
                          },
                        },
                      ],
                    },
                  ],
                }
              : {}),
          },
          orderBy: [
            { updatedAt: "desc" },
            { id: "desc" },
          ],
          take: limit + 1,
        })
      );

      let nextCursor: string | null = null;
      if (objectives.length > limit) {
        const last = objectives.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.updatedAt.toISOString(),
        });
      }

      return reply.send({
        items: objectives.map((objective) => ({
          id: objective.id,
          name: objective.name,
          description: objective.description,
          ownerId: objective.ownerId,
          createdAt: objective.createdAt.toISOString(),
          updatedAt: objective.updatedAt.toISOString(),
        })),
        page: {
          size: limit,
          next: nextCursor,
        },
      });
    }
  );

  router.post(
    "/objectives",
    {
      preHandler: fastify.authenticate,
      schema: {
        body: objectiveBodySchema,
        response: {
          201: objectiveResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { name, description, ownerId } = request.body;

      const ownerValid =
        !ownerId ||
        (await fastify.withTenant(tenantId, (tx) =>
          tx.organizationMember.findFirst({
            where: { userId: ownerId },
          })
        ));

      if (ownerId && !ownerValid) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_OBJECTIVE_OWNER_INVALID",
          detail: "Owner must belong to the organization.",
        });
      }

      const createData: Prisma.ObjectiveUncheckedCreateInput = {
        organizationId: tenantId,
        name,
        description: description ?? null,
        ownerId: ownerId ?? null,
      };

      const objective = await fastify.withTenant(tenantId, (tx) =>
        tx.objective.create({
          data: createData,
        })
      );

      return reply.status(201).send({
        id: objective.id,
        name: objective.name,
        description: objective.description,
        ownerId: objective.ownerId,
        createdAt: objective.createdAt.toISOString(),
        updatedAt: objective.updatedAt.toISOString(),
      });
    }
  );

  router.get(
    "/objectives/:id",
    {
      preHandler: fastify.authenticate,
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: objectiveResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params;

      const objective = await fastify.withTenant(tenantId, (tx) =>
        tx.objective.findUnique({ where: { id } })
      );

      if (!objective) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_OBJECTIVE_NOT_FOUND",
          detail: "Objective not found.",
        });
      }

      return reply.send({
        id: objective.id,
        name: objective.name,
        description: objective.description,
        ownerId: objective.ownerId,
        createdAt: objective.createdAt.toISOString(),
        updatedAt: objective.updatedAt.toISOString(),
      });
    }
  );

  router.patch(
    "/objectives/:id",
    {
      preHandler: fastify.authenticate,
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        body: objectiveBodySchema.partial(),
        response: {
          200: objectiveResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params;
      const data = request.body;

      if (!Object.keys(data).length) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_OBJECTIVE_NO_CHANGES",
          detail: "No changes provided.",
        });
      }

      if (data.ownerId !== undefined && data.ownerId !== null) {
        const ownerValid = await fastify.withTenant(tenantId, (tx) =>
          tx.organizationMember.findFirst({
            where: { userId: data.ownerId! },
          })
        );

        if (!ownerValid) {
          return sendProblem(reply, request, {
            status: 400,
            code: "E_OBJECTIVE_OWNER_INVALID",
            detail: "Owner must belong to the organization.",
          });
        }
      }

      const updateData: Prisma.ObjectiveUncheckedUpdateInput = {};

      if (data.name !== undefined) {
        updateData.name = data.name;
      }
      if (data.description !== undefined) {
        updateData.description = data.description;
      }
      if (data.ownerId !== undefined) {
        updateData.ownerId = data.ownerId ?? null;
      }

      const objective = await fastify.withTenant(tenantId, (tx) =>
        tx.objective.update({
          where: { id },
          data: updateData,
        })
      );

      return reply.send({
        id: objective.id,
        name: objective.name,
        description: objective.description,
        ownerId: objective.ownerId,
        createdAt: objective.createdAt.toISOString(),
        updatedAt: objective.updatedAt.toISOString(),
      });
    }
  );
};
