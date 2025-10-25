import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { StrategicCadence } from "@prisma/client";
import { z } from "zod";
import { sendProblem } from "@/http/problem";
import { decodeCursor, encodeCursor } from "@/lib/pagination";

const periodBodySchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  cadence: z.nativeEnum(StrategicCadence),
});

const periodPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  cadence: z.nativeEnum(StrategicCadence).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});

const periodResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  cadence: z.nativeEnum(StrategicCadence),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const listQuerySchema = z.object({
  updatedSince: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const listResponseSchema = z.object({
  items: z.array(periodResponseSchema),
  page: z.object({ size: z.number(), next: z.string().nullable() }),
});

export const periodRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();

  router.post(
    "/periods",
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ["periods"],
        body: periodBodySchema,
        response: { 201: periodResponseSchema },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const payload = request.body;

      if (new Date(payload.startDate) >= new Date(payload.endDate)) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_PERIOD_DATE_INVALID",
          detail: "startDate must be earlier than endDate.",
        });
      }

      const period = await fastify.withTenant(tenantId, (tx) =>
        tx.strategicPeriod.create({
          data: {
            organizationId: tenantId,
            name: payload.name,
            startDate: new Date(payload.startDate),
            endDate: new Date(payload.endDate),
            cadence: payload.cadence,
            status: "DRAFT",
          },
        })
      );

      return reply.status(201).send({
        id: period.id,
        name: period.name,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
        cadence: period.cadence,
        status: period.status,
        createdAt: period.createdAt.toISOString(),
        updatedAt: period.updatedAt.toISOString(),
      });
    }
  );

  router.get(
    "/periods",
    {
      preHandler: fastify.authenticate,
      schema: { tags: ["periods"], querystring: listQuerySchema, response: { 200: listResponseSchema } },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { updatedSince, limit, cursor } = request.query;
      const decoded = decodeCursor(cursor);

      const periods = await fastify.withTenant(tenantId, (tx) =>
        tx.strategicPeriod.findMany({
          where: {
            ...(updatedSince ? { updatedAt: { gte: new Date(updatedSince) } } : {}),
            ...(decoded
              ? {
                  OR: [
                    { updatedAt: { lt: new Date(decoded.createdAt) } },
                    {
                      AND: [
                        { updatedAt: { equals: new Date(decoded.createdAt) } },
                        { id: { lt: decoded.id } },
                      ],
                    },
                  ],
                }
              : {}),
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: limit + 1,
        })
      );

      let nextCursor: string | null = null;
      if (periods.length > limit) {
        const last = periods.pop()!;
        nextCursor = encodeCursor({ id: last.id, createdAt: last.updatedAt.toISOString() });
      }

      return reply.send({
        items: periods.map((p) => ({
          id: p.id,
          name: p.name,
          startDate: p.startDate.toISOString(),
          endDate: p.endDate.toISOString(),
          cadence: p.cadence,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        page: { size: limit, next: nextCursor },
      });
    }
  );

  router.patch(
    "/periods/:id",
    {
      preHandler: fastify.authenticate,
      schema: { tags: ["periods"], params: z.object({ id: z.string().uuid() }), body: periodPatchSchema, response: { 200: periodResponseSchema } },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params;
      const data = request.body;

      if (!Object.keys(data).length) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_PERIOD_NO_CHANGES",
          detail: "No changes provided.",
        });
      }

      if (data.startDate && data.endDate) {
        if (new Date(data.startDate) >= new Date(data.endDate)) {
          return sendProblem(reply, request, {
            status: 400,
            code: "E_PERIOD_DATE_INVALID",
            detail: "startDate must be earlier than endDate.",
          });
        }
      }

      const period = await fastify.withTenant(tenantId, (tx) =>
        tx.strategicPeriod.update({
          where: { id },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
            ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
            ...(data.cadence ? { cadence: data.cadence } : {}),
            ...(data.status ? { status: data.status } : {}),
          },
        })
      );

      return reply.send({
        id: period.id,
        name: period.name,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
        cadence: period.cadence,
        status: period.status,
        createdAt: period.createdAt.toISOString(),
        updatedAt: period.updatedAt.toISOString(),
      });
    }
  );

  router.get(
    "/periods/:id/summary",
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ["periods"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            period: z.object({ id: z.string().uuid(), name: z.string(), startDate: z.string(), endDate: z.string(), cadence: z.nativeEnum(StrategicCadence) }),
            objectives: z.array(
              z.object({
                id: z.string().uuid(),
                name: z.string(),
                startDate: z.string(),
                endDate: z.string(),
                cadence: z.nativeEnum(StrategicCadence),
                krCount: z.number(),
                krs: z.array(
                  z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), direction: z.string() })
                ),
              })
            ),
            pis: z.array(z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), direction: z.string() })),
            gate: z.object({ allObjectivesHaveKR: z.boolean() }),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params;

      const period = await fastify.withTenant(tenantId, (tx) =>
        tx.strategicPeriod.findUnique({ where: { id } })
      );
      if (!period) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_PERIOD_NOT_FOUND",
          detail: "Period not found.",
        });
      }

      const objectives = await fastify.withTenant(tenantId, (tx) =>
        tx.objective.findMany({ where: { periodId: id } })
      );

      const [krGroups, pis] = await fastify.withTenant(tenantId, async (tx) => {
        const indicators = await tx.indicatorDefinition.findMany({
          where: { OR: [{ periodId: id }, { objectiveId: { in: objectives.map((o) => o.id) } }] },
          select: { id: true, code: true, name: true, direction: true, isKeyResult: true, objectiveId: true, periodId: true },
        });
        const krMap = new Map<string, { id: string; code: string; name: string; direction: string }[]>();
        const pis: { id: string; code: string; name: string; direction: string }[] = [];
        for (const ind of indicators) {
          if (ind.isKeyResult && ind.objectiveId) {
            const arr = krMap.get(ind.objectiveId) ?? [];
            arr.push({ id: ind.id, code: ind.code, name: ind.name, direction: ind.direction });
            krMap.set(ind.objectiveId, arr);
          } else if (!ind.isKeyResult && ind.periodId) {
            pis.push({ id: ind.id, code: ind.code, name: ind.name, direction: ind.direction });
          }
        }
        return [krMap, pis] as const;
      });

      const resultObjectives = objectives.map((o) => {
        const krs = krGroups.get(o.id) ?? [];
        return {
          id: o.id,
          name: o.name,
          startDate: o.startDate.toISOString(),
          endDate: o.endDate.toISOString(),
          cadence: o.cadence,
          krCount: krs.length,
          krs,
        };
      });

      const gate = { allObjectivesHaveKR: resultObjectives.every((o) => o.krCount >= 1) };

      return reply.send({
        period: {
          id: period.id,
          name: period.name,
          startDate: period.startDate.toISOString(),
          endDate: period.endDate.toISOString(),
          cadence: period.cadence,
        },
        objectives: resultObjectives,
        pis,
        gate,
      });
    }
  );
};
