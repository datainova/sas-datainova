import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { IndicatorDirection, PeriodGranularity, Prisma } from "@prisma/client";
import { z } from "zod";
import { sendProblem } from "@/http/problem";
import { decodeCursor, encodeCursor } from "@/lib/pagination";
import {
  canonicalizeSegmentKey,
  hashSegmentKey,
  SegmentKey,
} from "@/lib/segment";
import {
  isPeriodAligned,
  normalizePeriodStart,
  parseDateRange,
} from "@/lib/period";

const indicatorsQuerySchema = z.object({
  updatedSince: z.string().datetime().optional(),
  objectiveId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const indicatorBodySchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  objectiveId: z.string().uuid().nullable().optional(),
  direction: z.nativeEnum(IndicatorDirection),
  granularityDefault: z.nativeEnum(PeriodGranularity),
  tolerance: z.number().min(0).max(1).nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
  segmentSchema: z
    .record(
      z.string(),
      z.object({
        type: z.enum(["string", "number", "boolean"]),
        required: z.boolean().optional(),
      })
    )
    .nullable()
    .optional(),
});

const indicatorResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  objectiveId: z.string().uuid().nullable(),
  direction: z.nativeEnum(IndicatorDirection),
  granularityDefault: z.nativeEnum(PeriodGranularity),
  tolerance: z.number().nullable(),
  unit: z.string().nullable(),
  segmentSchema: z
    .record(
      z.string(),
      z.object({
        type: z.enum(["string", "number", "boolean"]),
        required: z.boolean().optional(),
      })
    )
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const indicatorsResponseSchema = z.object({
  items: z.array(indicatorResponseSchema),
  page: z.object({
    size: z.number(),
    next: z.string().nullable(),
  }),
});

const targetItemSchema = z.object({
  period_start: z.string().datetime(),
  granularity: z.nativeEnum(PeriodGranularity),
  segment_key: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  target_value: z.number(),
  tolerance_override: z.number().min(0).max(1).nullable().optional(),
});

const targetsResponseSchema = z.object({
  items: z.array(
    z.object({
      period_start: z.string(),
      granularity: z.nativeEnum(PeriodGranularity),
      segment_key: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable(),
      target_value: z.number(),
      tolerance_override: z.number().nullable(),
      updated_at: z.string(),
    })
  ),
  page: z.object({
    size: z.number(),
    next: z.string().nullable(),
  }),
});

const valuesQuerySchema = z.object({
  range: z.string().optional(),
  segment: z.string().optional(),
  latestOnly: z
    .union([z.literal("true"), z.literal("false")])
    .transform((value) => value === "true")
    .optional(),
  limit: z.coerce.number().min(1).max(500).default(200),
  cursor: z.string().optional(),
});

const valuesResponseSchema = z.object({
  items: z.array(
    z.object({
      period_start: z.string(),
      granularity: z.nativeEnum(PeriodGranularity),
      segment_key: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean()])
      ),
      segment_hash: z.string(),
      value: z.number(),
      version: z.number(),
      source: z.string().optional(),
      lineage_batch_id: z.string().nullable(),
      lineage_checksum: z.string().nullable(),
      updated_at: z.string(),
    })
  ),
  page: z.object({
    size: z.number(),
    next: z.string().nullable(),
  }),
});

const manualValueBodySchema = z.object({
  period_start: z.string().datetime(),
  granularity: z.nativeEnum(PeriodGranularity),
  segment_key: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()])
  ),
  value: z.number(),
});

const manualValueResponseSchema = z.object({
  id: z.string().uuid(),
  period_start: z.string(),
  granularity: z.nativeEnum(PeriodGranularity),
  segment_key: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()])
  ),
  segment_hash: z.string(),
  value: z.number(),
  version: z.number(),
  source: z.string(),
  updated_at: z.string(),
});

const encodeValueCursor = (payload: {
  periodStart: Date;
  segmentHash: Buffer;
  version: number;
}) =>
  Buffer.from(
    JSON.stringify({
      period_start: payload.periodStart.toISOString(),
      segment_hash: payload.segmentHash.toString("hex"),
      version: payload.version,
    })
  ).toString("base64url");

const decodeValueCursor = (cursor?: string | null) => {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8")
    ) as { period_start: string; segment_hash: string; version: number };
    return decoded;
  } catch {
    return null;
  }
};

const segmentKeySchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .optional();

const joinSql = (parts: Prisma.Sql[]): Prisma.Sql => {
  const [first, ...rest] = parts;
  return rest.reduce((acc, fragment) => Prisma.sql`${acc} ${fragment}`, first);
};

export const indicatorRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();
    router.get(
    "/indicators",
    {
      preHandler: fastify.authenticate,
      schema: {
        querystring: indicatorsQuerySchema,
        response: {
          200: indicatorsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { updatedSince, objectiveId, limit, cursor } = request.query;
      const decodedCursor = decodeCursor(cursor);

      const indicators = await fastify.withTenant(tenantId, (tx) =>
        tx.indicatorDefinition.findMany({
          where: {
            ...(objectiveId ? { objectiveId } : {}),
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
                        { id: { lt: decodedCursor.id } },
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
      if (indicators.length > limit) {
        const last = indicators.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.updatedAt.toISOString(),
        });
      }

      return reply.send({
        items: indicators.map((indicator) => ({
          id: indicator.id,
          code: indicator.code,
          name: indicator.name,
          objectiveId: indicator.objectiveId,
          direction: indicator.direction,
          granularityDefault: indicator.granularityDefault,
          tolerance: indicator.tolerance ? Number(indicator.tolerance) : null,
          unit: indicator.unit ?? null,
          segmentSchema: null,
          createdAt: indicator.createdAt.toISOString(),
          updatedAt: indicator.updatedAt.toISOString(),
        })),
        page: {
          size: limit,
          next: nextCursor,
        },
      });
    }
  );

  router.post(
    "/indicators",
    {
      preHandler: fastify.authenticate,
      schema: {
        body: indicatorBodySchema,
        response: {
          201: indicatorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const payload = request.body;

      const objectiveValid =
        !payload.objectiveId ||
        (await fastify.withTenant(tenantId, (tx) =>
          tx.objective.findUnique({ where: { id: payload.objectiveId! } })
        ));

      if (payload.objectiveId && !objectiveValid) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_INDICATOR_INVALID_OBJECTIVE",
          detail: "Objective not found for this organization.",
        });
      }

      let indicator;
      try {
        indicator = await fastify.withTenant(tenantId, (tx) =>
          tx.indicatorDefinition.create({
            data: {
              organizationId: tenantId,
              code: payload.code,
              name: payload.name,
              objectiveId: payload.objectiveId ?? null,
              direction: payload.direction,
              granularityDefault: payload.granularityDefault,
              tolerance:
                payload.tolerance !== undefined && payload.tolerance !== null
                  ? new Prisma.Decimal(payload.tolerance)
                  : null,
              unit: payload.unit ?? null,
            },
          })
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return sendProblem(reply, request, {
            status: 409,
            code: "E_INDICATOR_DUPLICATE_CODE",
            detail: "Indicator code already exists.",
          });
        }
        throw error;
      }

      return reply.status(201).send({
        id: indicator.id,
        code: indicator.code,
        name: indicator.name,
        objectiveId: indicator.objectiveId,
        direction: indicator.direction,
        granularityDefault: indicator.granularityDefault,
        tolerance: indicator.tolerance ? Number(indicator.tolerance) : null,
        unit: indicator.unit ?? null,
        segmentSchema: null,
        createdAt: indicator.createdAt.toISOString(),
        updatedAt: indicator.updatedAt.toISOString(),
      });
    }
  );

  router.get(
    "/indicators/:id",
    {
      preHandler: fastify.authenticate,
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: indicatorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params;

      const indicator = await fastify.withTenant(tenantId, (tx) =>
        tx.indicatorDefinition.findUnique({ where: { id } })
      );

      if (!indicator) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_INDICATOR_NOT_FOUND",
          detail: "Indicator not found.",
        });
      }

      return reply.send({
        id: indicator.id,
        code: indicator.code,
        name: indicator.name,
        objectiveId: indicator.objectiveId,
        direction: indicator.direction,
        granularityDefault: indicator.granularityDefault,
        tolerance: indicator.tolerance ? Number(indicator.tolerance) : null,
        unit: indicator.unit ?? null,
        segmentSchema: null,
        createdAt: indicator.createdAt.toISOString(),
        updatedAt: indicator.updatedAt.toISOString(),
      });
    }
  );

  router.patch(
    "/indicators/:id",
    {
      preHandler: fastify.authenticate,
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        body: indicatorBodySchema.partial(),
        response: {
          200: indicatorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params;
      const payload = request.body;

      if (!Object.keys(payload).length) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_INDICATOR_NO_CHANGES",
          detail: "No changes provided.",
        });
      }

      if (payload.objectiveId) {
        const objectiveValid = await fastify.withTenant(tenantId, (tx) =>
          tx.objective.findUnique({ where: { id: payload.objectiveId! } })
        );
        if (!objectiveValid) {
          return sendProblem(reply, request, {
            status: 400,
            code: "E_INDICATOR_INVALID_OBJECTIVE",
            detail: "Objective not found for this organization.",
          });
        }
      }

      const indicator = await fastify.withTenant(tenantId, (tx) =>
        tx.indicatorDefinition.update({
          where: { id },
          data: {
            ...(payload.code ? { code: payload.code } : {}),
            ...(payload.name ? { name: payload.name } : {}),
            ...(payload.objectiveId !== undefined
              ? { objectiveId: payload.objectiveId ?? null }
              : {}),
            ...(payload.direction ? { direction: payload.direction } : {}),
            ...(payload.granularityDefault
              ? { granularityDefault: payload.granularityDefault }
              : {}),
            ...(payload.tolerance !== undefined
              ? {
                  tolerance:
                    payload.tolerance !== null
                      ? new Prisma.Decimal(payload.tolerance)
                      : null,
                }
              : {}),
            ...(payload.unit !== undefined ? { unit: payload.unit ?? null } : {}),
          },
        })
      );

      return reply.send({
        id: indicator.id,
        code: indicator.code,
        name: indicator.name,
        objectiveId: indicator.objectiveId,
        direction: indicator.direction,
        granularityDefault: indicator.granularityDefault,
        tolerance: indicator.tolerance ? Number(indicator.tolerance) : null,
        unit: indicator.unit ?? null,
        segmentSchema: null,
        createdAt: indicator.createdAt.toISOString(),
        updatedAt: indicator.updatedAt.toISOString(),
      });
    }
  );

  router.get(
    "/indicators/:id/targets",
    {
      preHandler: fastify.authenticate,
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        querystring: z.object({
          range: z.string().optional(),
          limit: z.coerce.number().min(1).max(200).default(100),
          cursor: z.string().optional(),
        }),
        response: {
          200: targetsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params;
      const { range, limit, cursor } = request.query;

      let parsedRange: { from: Date; to: Date } | null = null;
      try {
        parsedRange = parseDateRange(range);
      } catch {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_RANGE_INVALID",
          detail: "Range must follow the pattern YYYY-MM-DD..YYYY-MM-DD.",
        });
      }

      const decodedCursor = decodeCursor(cursor);

      const targets = await fastify.withTenant(tenantId, (tx) =>
        tx.indicatorTarget.findMany({
          where: {
            indicatorId: id,
            ...(parsedRange
              ? {
                  periodStartUtc: {
                    gte: parsedRange.from,
                    lte: parsedRange.to,
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
                        { id: { lt: decodedCursor.id } },
                      ],
                    },
                  ],
                }
              : {}),
          },
          orderBy: [
            { periodStartUtc: "asc" },
            { segmentHash: "asc" },
          ],
          take: limit + 1,
        })
      );

      let nextCursor: string | null = null;
      if (targets.length > limit) {
        const last = targets.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.updatedAt.toISOString(),
        });
      }

      return reply.send({
        items: targets.map((target) => ({
          period_start: target.periodStartUtc.toISOString(),
          granularity: target.granularity,
          segment_key: (target.segmentKey ?? null) as SegmentKey | null,
          target_value: Number(target.targetValue),
          tolerance_override: target.toleranceOverride
            ? Number(target.toleranceOverride)
            : null,
          updated_at: target.updatedAt.toISOString(),
        })),
        page: {
          size: limit,
          next: nextCursor,
        },
      });
    }
  );

  router.post(
    "/indicators/:id/targets",
    {
      preHandler: fastify.authenticate,
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          items: z.array(targetItemSchema).min(1),
        }),
        response: {
          200: z.object({
            created: z.number(),
            updated: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params;
      const { items } = request.body;

      const { organization, indicator } = await fastify.withTenant(
        tenantId,
        async (tx) => {
          const [organization, indicator] = await Promise.all([
            tx.organization.findUnique({ where: { id: tenantId } }),
            tx.indicatorDefinition.findUnique({ where: { id } }),
          ]);
          return { organization, indicator };
        }
      );

      if (!indicator || !organization) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_INDICATOR_NOT_FOUND",
          detail: "Indicator not found.",
        });
      }

      let created = 0;
      let updated = 0;

      await fastify.withTenant(tenantId, async (tx) => {
        for (const item of items) {
          if (
            !isPeriodAligned(
              item.period_start,
              item.granularity,
              organization.tz
            )
          ) {
            throw new Error("invalid_period_alignment");
          }

          const normalized = normalizePeriodStart(
            item.period_start,
            item.granularity,
            organization.tz
          );

          const canonical = canonicalizeSegmentKey(
            (item.segment_key ?? null) as SegmentKey | null
          );
          const hash = hashSegmentKey(canonical);

          const existing = await tx.indicatorTarget.findUnique({
            where: {
              organizationId_indicatorId_periodStartUtc_segmentHash: {
                organizationId: tenantId,
                indicatorId: id,
                periodStartUtc: normalized,
                segmentHash: hash,
              },
            },
          });

          const updateData = {
            granularity: item.granularity,
            segmentKey: canonical ?? Prisma.JsonNull,
            targetValue: new Prisma.Decimal(item.target_value),
            toleranceOverride:
              item.tolerance_override !== undefined
                ? item.tolerance_override !== null
                  ? new Prisma.Decimal(item.tolerance_override)
                  : null
                : undefined,
          } as Prisma.IndicatorTargetUpdateInput;

          const createData = {
            organizationId: tenantId,
            indicatorId: id,
            periodStartUtc: normalized,
            granularity: item.granularity,
            segmentKey: canonical ?? Prisma.JsonNull,
            segmentHash: hash,
            targetValue: new Prisma.Decimal(item.target_value),
            toleranceOverride:
              item.tolerance_override !== undefined
                ? item.tolerance_override !== null
                  ? new Prisma.Decimal(item.tolerance_override)
                  : null
                : undefined,
          } as Prisma.IndicatorTargetUncheckedCreateInput;

          await tx.indicatorTarget.upsert({
            where: {
              organizationId_indicatorId_periodStartUtc_segmentHash: {
                organizationId: tenantId,
                indicatorId: id,
                periodStartUtc: normalized,
                segmentHash: hash,
              },
            },
            update: updateData,
            create: createData,
          });

          if (existing) {
            updated += 1;
          } else {
            created += 1;
          }
        }
      });

      return reply.send({ created, updated });
    }
  );

  router.get(
    "/indicators/:id/values",
    {
      preHandler: fastify.authenticate,
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        querystring: valuesQuerySchema,
        response: {
          200: valuesResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params;
      const { range, segment, latestOnly = true, limit, cursor } = request.query;

      let parsedRange: { from: Date; to: Date } | null = null;
      try {
        parsedRange = parseDateRange(range);
      } catch (error) {
        if (range) {
          return sendProblem(reply, request, {
            status: 400,
            code: "E_RANGE_INVALID",
            detail: "Range must follow the pattern YYYY-MM-DD..YYYY-MM-DD.",
          });
        }
      }

      let segmentFilter: SegmentKey | null = null;
      if (segment) {
        try {
          segmentFilter = JSON.parse(segment) as SegmentKey;
        } catch {
          return sendProblem(reply, request, {
            status: 400,
            code: "E_SEGMENT_INVALID",
            detail: "Segment filter must be a valid JSON object.",
          });
        }
      }

      const decodedCursor = decodeValueCursor(cursor);

      const values = await fastify.withTenant(tenantId, async (tx) => {
        if (latestOnly) {
          const statements: Prisma.Sql[] = [
            Prisma.sql`
              SELECT indicator_id,
                     period_start_utc,
                     granularity,
                     segment_key,
                     segment_hash,
                     value,
                     version,
                     updated_at
              FROM indicator_value_latest
              WHERE indicator_id = ${id}
            `,
          ];

          if (parsedRange) {
            statements.push(
              Prisma.sql` AND period_start_utc BETWEEN ${parsedRange.from} AND ${parsedRange.to}`
            );
          }

          if (segmentFilter) {
            const hash = hashSegmentKey(segmentFilter);
            statements.push(Prisma.sql` AND segment_hash = ${hash}`);
          }

          if (decodedCursor) {
            statements.push(
              Prisma.sql`
                AND (
                  period_start_utc > ${new Date(decodedCursor.period_start)} OR
                  (period_start_utc = ${new Date(
                    decodedCursor.period_start
                  )} AND segment_hash > ${Buffer.from(
                decodedCursor.segment_hash,
                "hex"
              )})
                )
              `
            );
          }

          statements.push(
            Prisma.sql` ORDER BY period_start_utc ASC, segment_hash ASC LIMIT ${limit + 1}`
          );

          const query = joinSql(statements);

          return tx.$queryRaw<
            Array<{
              indicator_id: string;
              period_start_utc: Date;
              granularity: PeriodGranularity;
              segment_key: SegmentKey;
              segment_hash: Buffer;
              value: Prisma.Decimal;
              version: number;
              updated_at: Date;
            }>
          >(query);
        }

        const statements: Prisma.Sql[] = [
          Prisma.sql`
            SELECT indicator_id,
                   period_start_utc,
                   granularity,
                   segment_key,
                   segment_hash,
                   value,
                   version,
                   source,
                   lineage_batch_id,
                   lineage_checksum,
                   updated_at
            FROM indicator_value
            WHERE indicator_id = ${id}
          `,
        ];

        if (parsedRange) {
          statements.push(
            Prisma.sql` AND period_start_utc BETWEEN ${parsedRange.from} AND ${parsedRange.to}`
          );
        }

        if (segmentFilter) {
          statements.push(
            Prisma.sql` AND segment_hash = ${hashSegmentKey(segmentFilter)}`
          );
        }

        if (decodedCursor) {
          const cursorDate = new Date(decodedCursor.period_start);
          const cursorHash = Buffer.from(decodedCursor.segment_hash, "hex");
          statements.push(
            Prisma.sql`
              AND (
                period_start_utc > ${cursorDate} OR
                (period_start_utc = ${cursorDate} AND segment_hash > ${cursorHash}) OR
                (period_start_utc = ${cursorDate} AND segment_hash = ${cursorHash} AND version > ${decodedCursor.version})
              )
            `
          );
        }

        statements.push(
          Prisma.sql` ORDER BY period_start_utc ASC, segment_hash ASC, version ASC LIMIT ${limit + 1}`
        );

        const query = joinSql(statements);

        return tx.$queryRaw<
          Array<{
            indicator_id: string;
            period_start_utc: Date;
            granularity: PeriodGranularity;
            segment_key: SegmentKey;
            segment_hash: Buffer;
            value: Prisma.Decimal;
            version: number;
            source: string;
            lineage_batch_id: string | null;
            lineage_checksum: string | null;
            updated_at: Date;
          }>
        >(query);
      });

      const valueItems = values as any[];

      let nextCursor: string | null = null;
      if (valueItems.length > limit) {
        const last = valueItems.pop()!;
        nextCursor = encodeValueCursor({
          periodStart:
            "period_start_utc" in last
              ? (last as any).period_start_utc
              : last.periodStartUtc,
          segmentHash:
            "segment_hash" in last
              ? (last as any).segment_hash
              : last.segmentHash,
          version: "version" in last ? (last as any).version : last.version,
        });
      }

      return reply.send({
        items: valueItems.map((value) => ({
          period_start:
            "period_start_utc" in value
              ? (value as any).period_start_utc.toISOString()
              : value.periodStartUtc.toISOString(),
          granularity:
            "granularity" in value
              ? (value as any).granularity
              : value.granularity,
          segment_key:
            "segment_key" in value
              ? (value as any).segment_key ?? {}
              : (value.segmentKey as SegmentKey),
          segment_hash: Buffer.from(
            "segment_hash" in value
              ? (value as any).segment_hash
              : value.segmentHash
          ).toString("hex"),
          value:
            "value" in value
              ? Number((value as any).value)
              : Number(value.value),
          version:
            "version" in value
              ? (value as any).version
              : (value as any).version,
          source:
            "source" in value
              ? (value as any).source
              : (value as any).source ?? "unknown",
          lineage_batch_id:
            "lineage_batch_id" in value
              ? (value as any).lineage_batch_id ?? null
              : (value as any).lineageBatchId ?? null,
          lineage_checksum:
            "lineage_checksum" in value
              ? (value as any).lineage_checksum ?? null
              : (value as any).lineageChecksum ?? null,
          updated_at:
            "updated_at" in value
              ? (value as any).updated_at.toISOString()
              : value.updatedAt.toISOString(),
        })),
        page: {
          size: limit,
          next: nextCursor,
        },
      });
    }
  );

  router.post(
    "/indicators/:id/values/manual",
    {
      preHandler: fastify.authenticate,
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        body: manualValueBodySchema,
        response: {
          201: manualValueResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params;
      const payload = request.body;

      const { indicator, organization } = await fastify.withTenant(
        tenantId,
        async (tx) => {
          const indicator = await tx.indicatorDefinition.findUnique({
            where: { id },
          });
          const organization = await tx.organization.findUnique({
            where: { id: tenantId },
          });
          return { indicator, organization };
        }
      );

      if (!indicator || !organization) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_INDICATOR_NOT_FOUND",
          detail: "Indicator not found.",
        });
      }

      if (
        !isPeriodAligned(
          payload.period_start,
          payload.granularity,
          organization.tz
        )
      ) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_VALUE_INVALID_PERIOD",
          detail: "period_start must align to the granularity for the tenant timezone.",
        });
      }

      const normalized = normalizePeriodStart(
        payload.period_start,
        payload.granularity,
        organization.tz
      );

      const canonical = canonicalizeSegmentKey(payload.segment_key);
      const segmentHash = hashSegmentKey(canonical);

      const result = await fastify.withTenant(tenantId, async (tx) => {
        const latest = await tx.indicatorValue.findFirst({
          where: {
            indicatorId: id,
            periodStartUtc: normalized,
            segmentHash: segmentHash ?? undefined,
          },
          orderBy: {
            version: "desc",
          },
        });

        const nextVersion = latest ? latest.version + 1 : 1;

        return tx.indicatorValue.create({
          data: {
            organizationId: tenantId,
            indicatorId: id,
            periodStartUtc: normalized,
            granularity: payload.granularity,
            segmentKey: canonical ?? {},
            segmentHash,
            value: new Prisma.Decimal(payload.value),
            version: nextVersion,
            source: "manual",
          },
        });
      });

      return reply.status(201).send({
        id: result.id,
        period_start: result.periodStartUtc.toISOString(),
        granularity: result.granularity,
        segment_key: result.segmentKey as SegmentKey,
        segment_hash: Buffer.from(result.segmentHash).toString("hex"),
        value: Number(result.value),
        version: result.version,
        source: result.source,
        updated_at: result.updatedAt.toISOString(),
      });
    }
  );
};
