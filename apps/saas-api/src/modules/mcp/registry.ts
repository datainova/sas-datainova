import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import {
  AgentStatus,
  AlertSeverity,
  PeriodGranularity,
  Prisma,
  RoleType,
  type BillingPlan as PrismaBillingPlan,
} from "@prisma/client";
import { decodeCursor, encodeCursor } from "@/lib/pagination";
import { parseDateRange } from "@/lib/period";
import {
  canonicalizeSegmentKey,
  hashSegmentKey,
  type SegmentKey,
} from "@/lib/segment";
import type {
  McpContext,
  McpPlan,
  McpPromptDefinition,
  McpResourceDefinition,
  McpToolDefinition,
} from "./types";
import { McpError } from "./errors";

export const planCaps: Record<McpPlan, { rpm: number; sse: boolean; websocket: boolean }> = {
  free: { rpm: 60, sse: false, websocket: false },
  pro: { rpm: 120, sse: true, websocket: false },
  enterprise: { rpm: 300, sse: true, websocket: true },
} as const;

const viewerRoles: RoleType[] = [
  RoleType.OWNER,
  RoleType.ADMIN,
  RoleType.EDITOR,
  RoleType.VIEWER,
  RoleType.MEMBER,
];

const editorRoles: RoleType[] = [RoleType.OWNER, RoleType.ADMIN, RoleType.EDITOR];
const adminRoles: RoleType[] = [RoleType.OWNER, RoleType.ADMIN];
const naiRoles: RoleType[] = editorRoles;

const joinSql = (parts: Prisma.Sql[]) => {
  const [first, ...rest] = parts;
  return rest.reduce((acc, fragment) => Prisma.sql`${acc} ${fragment}`, first);
};

const encodeValueCursor = (payload: {
  periodStart: Date;
  segmentHash: Buffer;
  version?: number | null;
}) =>
  Buffer.from(
    JSON.stringify({
      period_start: payload.periodStart.toISOString(),
      segment_hash: payload.segmentHash.toString("hex"),
      version: payload.version ?? null,
    })
  ).toString("base64url");

const decodeValueCursor = (
  cursor?: string | null
): { period_start: string; segment_hash: string; version: number | null } | null => {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8")
    ) as { period_start: string; segment_hash: string; version: number | null };
    if (!decoded.period_start || !decoded.segment_hash) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

const objectivesListInput = z
  .object({
    updatedSince: z.string().datetime().optional(),
    limit: z.number().min(1).max(100).default(50),
    cursor: z.string().optional(),
  })
  .default({});

const objectiveGetInput = z.object({
  objectiveId: z.string().uuid(),
});

const indicatorsListInput = z
  .object({
    updatedSince: z.string().datetime().optional(),
    objectiveId: z.string().uuid().optional(),
    limit: z.number().min(1).max(100).default(50),
    cursor: z.string().optional(),
  })
  .default({});

const indicatorGetInput = z.object({
  indicatorId: z.string().uuid(),
});

const indicatorValuesInput = z
  .object({
    indicatorId: z.string().uuid(),
    range: z.string().optional(),
    granularity: z.nativeEnum(PeriodGranularity).optional(),
    segment: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    latestOnly: z.boolean().default(true),
    limit: z.number().min(1).max(500).default(200),
    cursor: z.string().optional(),
  })
  .default({});

const indicatorTargetsInput = z
  .object({
    indicatorId: z.string().uuid(),
    range: z.string().optional(),
    limit: z.number().min(1).max(200).default(100),
    cursor: z.string().optional(),
  })
  .default({});

const segmentsSchemaInput = z.object({
  indicatorId: z.string().uuid(),
});

const alertsListInput = z
  .object({
    severity: z.nativeEnum(AlertSeverity).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.number().min(1).max(100).default(50),
    cursor: z.string().optional(),
  })
  .default({});

const alertsAckInput = z.object({
  alertId: z.string().uuid(),
  comment: z.string().max(500).optional(),
});

const checkinsListInput = z
  .object({
    objectiveId: z.string().uuid().optional(),
    indicatorId: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.number().min(1).max(100).default(50),
    cursor: z.string().optional(),
  })
  .default({});

const checkinsCreateInput = z.object({
  indicatorId: z.string().uuid().optional(),
  summary: z.string().min(1).max(2000),
});

const agentsRegisterInput = z.object({
  name: z.string().min(1).max(120),
});

const agentsRotateInput = z.object({
  agentId: z.string().uuid(),
});

const billingPlanGetInput = z.object({}).default({});

const billingPlanSetInput = z.object({
  plan: z.enum(["free", "pro", "enterprise"]),
});

const auditSearchInput = z
  .object({
    action: z.string().optional(),
    entity: z.string().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.number().min(1).max(200).default(100),
    cursor: z.string().optional(),
  })
  .default({});

const naiObjectiveTitleInput = z
  .object({
    industry: z.string().optional(),
    mission: z.string().optional(),
    draft: z.string().optional(),
  })
  .default({});

const naiKrNameInput = z
  .object({
    indicator: z.string(),
    direction: z.string().optional(),
    unit: z.string().optional(),
  })
  .default({});

const naiSegmentValuesInput = z.object({
  indicatorId: z.string().uuid(),
  draft: z.array(z.record(z.string(), z.any())).optional(),
});

const naiExplainStatusInput = z.object({
  indicator: z.string(),
  period: z.string().optional(),
  value: z.number().optional(),
  target: z.number().optional(),
  status: z.enum(["on_track", "at_risk", "behind"]).optional(),
});

const createListPage = <T>(collection: T[], limit: number, nextCursor: string | null) => ({
  items: collection,
  page: {
    size: limit,
    next: nextCursor,
  },
});

const getParsedRange = (range: string | undefined) => {
  if (!range) {
    return null;
  }

  try {
    return parseDateRange(range);
  } catch {
    throw new McpError(
      400,
      "E_RANGE_INVALID",
      "Range must follow the pattern YYYY-MM-DD..YYYY-MM-DD."
    );
  }
};

const ensureRole = (ctx: McpContext, allowed: RoleType[], detail: string) => {
  if (!allowed.includes(ctx.user.role)) {
    throw new McpError(403, "E_FORBIDDEN", detail);
  }
};

const generateSecret = () => randomBytes(32).toString("hex");
const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

const collectSegmentKeys = (segmentSources: Array<{ segment_key?: SegmentKey | null }>) => {
  const keys = new Set<string>();
  for (const entry of segmentSources) {
    const segment = entry.segment_key as SegmentKey | null | undefined;
    if (!segment) continue;
    for (const key of Object.keys(segment)) {
      keys.add(key);
    }
  }
  return Array.from(keys.values()).sort();
};

const deriveSegmentSchema = async (
  ctx: McpContext,
  indicatorId: string
): Promise<{ indicator: { id: string; name: string }; keys: string[] }> => {
  const snapshot = await ctx.fastify.withTenant(ctx.tenantId, async (tx) => {
    const indicator = await tx.indicatorDefinition.findUnique({
      where: { id: indicatorId },
      select: { id: true, name: true },
    });

    if (!indicator) {
      return null;
    }

    const [targets, values] = await Promise.all([
      tx.indicatorTarget.findMany({
        where: { indicatorId },
        select: { segmentKey: true },
        take: 100,
      }),
      tx.indicatorValue.findMany({
        where: { indicatorId },
        select: { segmentKey: true },
        take: 100,
      }),
    ]);

    return { indicator, targets, values };
  });

  if (!snapshot) {
    throw new McpError(404, "E_INDICATOR_NOT_FOUND", "Indicator not found.");
  }

  const keys = collectSegmentKeys([
    ...snapshot.targets,
    ...snapshot.values,
  ] as Array<{ segment_key?: SegmentKey | null }>);

  return {
    indicator: snapshot.indicator,
    keys,
  };
};

export const mcpTools: McpToolDefinition[] = [
  {
    name: "objectives.list",
    title: "Listar objetivos",
    description: "Retorna os objetivos cadastrados com suporte a paginação incremental.",
    inputSchema: objectivesListInput,
    rateLimit: { rpm: 120 },
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = objectivesListInput.parse(rawInput ?? {});
      const { updatedSince, limit, cursor } = input;
      const decodedCursor = decodeCursor(cursor);

      const objectives = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
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
                          id: { lt: decodedCursor.id },
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

      return createListPage(
        objectives.map((objective) => ({
          id: objective.id,
          name: objective.name,
          description: objective.description,
          ownerId: objective.ownerId,
          createdAt: objective.createdAt.toISOString(),
          updatedAt: objective.updatedAt.toISOString(),
        })),
        limit,
        nextCursor
      );
    },
  },
  {
    name: "objectives.get",
    title: "Detalhar objetivo",
    description: "Retorna um objetivo específico pelo identificador.",
    inputSchema: objectiveGetInput,
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = objectiveGetInput.parse(rawInput ?? {});

      const objective = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.objective.findUnique({ where: { id: input.objectiveId } })
      );

      if (!objective) {
        throw new McpError(404, "E_OBJECTIVE_NOT_FOUND", "Objective not found.");
      }

      return {
        id: objective.id,
        name: objective.name,
        description: objective.description,
        ownerId: objective.ownerId,
        createdAt: objective.createdAt.toISOString(),
        updatedAt: objective.updatedAt.toISOString(),
      };
    },
  },
  {
    name: "indicators.list",
    title: "Listar indicadores",
    description: "Lista indicadores com filtros de objetivo e atualização.",
    inputSchema: indicatorsListInput,
    rateLimit: { rpm: 120 },
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = indicatorsListInput.parse(rawInput ?? {});
      const { updatedSince, objectiveId, limit, cursor } = input;
      const decodedCursor = decodeCursor(cursor);

      const indicators = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
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
                        {
                          id: { lt: decodedCursor.id },
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
      if (indicators.length > limit) {
        const last = indicators.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.updatedAt.toISOString(),
        });
      }

      return createListPage(
        indicators.map((indicator) => ({
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
        limit,
        nextCursor
      );
    },
  },
  {
    name: "indicators.get",
    title: "Detalhar indicador",
    description: "Retorna um indicador com metadados de segmentação.",
    inputSchema: indicatorGetInput,
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = indicatorGetInput.parse(rawInput ?? {});

      const indicator = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.indicatorDefinition.findUnique({ where: { id: input.indicatorId } })
      );

      if (!indicator) {
        throw new McpError(404, "E_INDICATOR_NOT_FOUND", "Indicator not found.");
      }

      const schema = await deriveSegmentSchema(ctx, indicator.id);

      return {
        id: indicator.id,
        code: indicator.code,
        name: indicator.name,
        objectiveId: indicator.objectiveId,
        direction: indicator.direction,
        granularityDefault: indicator.granularityDefault,
        tolerance: indicator.tolerance ? Number(indicator.tolerance) : null,
        unit: indicator.unit ?? null,
        segmentSchema: {
          keys: schema.keys,
          aliases: {},
        },
        createdAt: indicator.createdAt.toISOString(),
        updatedAt: indicator.updatedAt.toISOString(),
      };
    },
  },
  {
    name: "indicators.values.list",
    title: "Listar valores de indicador",
    description:
      "Retorna valores agregados (versionados) de um indicador, com filtro de período, granularidade e segmento.",
    inputSchema: indicatorValuesInput,
    rateLimit: { rpm: 120 },
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = indicatorValuesInput.parse(rawInput ?? {});
      const {
        indicatorId,
        range,
        granularity,
        segment,
        latestOnly,
        limit,
        cursor,
      } = input;

      const parsedRange = getParsedRange(range);
      const decodedCursor = decodeValueCursor(cursor);

      const values = await ctx.fastify.withTenant(ctx.tenantId, async (tx) => {
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
              WHERE indicator_id = ${indicatorId}
            `,
          ];

          if (granularity) {
            statements.push(Prisma.sql` AND granularity = ${granularity}`);
          }

          if (parsedRange) {
            statements.push(
              Prisma.sql` AND period_start_utc BETWEEN ${parsedRange.from} AND ${parsedRange.to}`
            );
          }

          if (segment) {
            const hash = hashSegmentKey(segment);
            statements.push(Prisma.sql` AND segment_hash = ${hash}`);
          }

          if (decodedCursor) {
            const cursorDate = new Date(decodedCursor.period_start);
            const cursorHash = Buffer.from(decodedCursor.segment_hash, "hex");
            statements.push(
              Prisma.sql`
                AND (
                  period_start_utc > ${cursorDate} OR
                  (period_start_utc = ${cursorDate} AND segment_hash > ${cursorHash})
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
            WHERE indicator_id = ${indicatorId}
          `,
        ];

        if (granularity) {
          statements.push(Prisma.sql` AND granularity = ${granularity}`);
        }

        if (parsedRange) {
          statements.push(
            Prisma.sql` AND period_start_utc BETWEEN ${parsedRange.from} AND ${parsedRange.to}`
          );
        }

        if (segment) {
          statements.push(
            Prisma.sql` AND segment_hash = ${hashSegmentKey(segment)}`
          );
        }

        if (decodedCursor) {
          const cursorDate = new Date(decodedCursor.period_start);
          const cursorHash = Buffer.from(decodedCursor.segment_hash, "hex");
          const cursorVersion = decodedCursor.version ?? 0;
          statements.push(
            Prisma.sql`
              AND (
                period_start_utc > ${cursorDate} OR
                (period_start_utc = ${cursorDate} AND segment_hash > ${cursorHash}) OR
                (period_start_utc = ${cursorDate} AND segment_hash = ${cursorHash} AND version > ${cursorVersion})
              )
            `
          );
        }

        statements.push(
          Prisma.sql`
            ORDER BY period_start_utc ASC, segment_hash ASC, version ASC
            LIMIT ${limit + 1}
          `
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

      let nextCursor: string | null = null;
      if (values.length > limit) {
        const last = values.pop()!;
        nextCursor = encodeValueCursor({
          periodStart: last.period_start_utc,
          segmentHash: last.segment_hash,
          version: last.version,
        });
      }

      const items = values.map((row) => ({
        indicatorId: row.indicator_id,
        periodStart: row.period_start_utc.toISOString(),
        granularity: row.granularity,
        segment: canonicalizeSegmentKey(row.segment_key),
        segmentHash: row.segment_hash.toString("hex"),
        value: Number(row.value),
        version: row.version,
        source: (row as any).source ?? undefined,
        lineageBatchId: (row as any).lineage_batch_id ?? null,
        lineageChecksum: (row as any).lineage_checksum ?? null,
        updatedAt: row.updated_at.toISOString(),
      }));

      const latestVersion = items.reduce((max, entry) => {
        return entry.version > max ? entry.version : max;
      }, 0);

      return {
        items,
        latestVersion: latestVersion || null,
        nextCursor,
      };
    },
  },
  {
    name: "indicators.targets.list",
    title: "Listar metas de indicador",
    description: "Retorna metas cadastradas para o indicador informado.",
    inputSchema: indicatorTargetsInput,
    rateLimit: { rpm: 120 },
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = indicatorTargetsInput.parse(rawInput ?? {});
      const { indicatorId, range, limit, cursor } = input;

      const parsedRange = getParsedRange(range);
      const decodedCursor = decodeCursor(cursor);

      const targets = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.indicatorTarget.findMany({
          where: {
            indicatorId,
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
                        {
                          id: { lt: decodedCursor.id },
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
      if (targets.length > limit) {
        const last = targets.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.updatedAt.toISOString(),
        });
      }

      return createListPage(
        targets.map((target) => ({
          id: target.id,
          periodStart: target.periodStartUtc.toISOString(),
          granularity: target.granularity,
          segment: (target.segmentKey as SegmentKey) ?? null,
          segmentHash: target.segmentHash?.toString("hex") ?? null,
          targetValue: Number(target.targetValue),
          toleranceOverride: target.toleranceOverride
            ? Number(target.toleranceOverride)
            : null,
          updatedAt: target.updatedAt.toISOString(),
        })),
        limit,
        nextCursor
      );
    },
  },
  {
    name: "segments.schema.get",
    title: "Schema de segmentos",
    description: "Retorna as chaves de segmentação observadas para o indicador.",
    inputSchema: segmentsSchemaInput,
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = segmentsSchemaInput.parse(rawInput ?? {});
      const schema = await deriveSegmentSchema(ctx, input.indicatorId);

      return {
        indicatorId: schema.indicator.id,
        indicatorName: schema.indicator.name,
        keys: schema.keys,
        aliases: {},
      };
    },
  },
  {
    name: "alerts.list",
    title: "Listar alertas",
    description: "Consulta alertas emitidos para a organização.",
    inputSchema: alertsListInput,
    rateLimit: { rpm: 60 },
    roles: editorRoles,
    plans: ["pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = alertsListInput.parse(rawInput ?? {});
      const { severity, from, to, limit, cursor } = input;
      const decodedCursor = decodeCursor(cursor);

      const alerts = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
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
                        {
                          id: { lt: decodedCursor.id },
                        },
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

      return createListPage(
        alerts.map((alert) => ({
          id: alert.id,
          indicatorId: alert.indicatorId,
          severity: alert.severity,
          kind: alert.kind,
          message: alert.message,
          context: (alert.context as Record<string, unknown>) ?? null,
          createdAt: alert.createdAt.toISOString(),
        })),
        limit,
        nextCursor
      );
    },
  },
  {
    name: "alerts.ack",
    title: "Acusar alerta",
    description: "Registra acknowledgment para um alerta aberto com comentário opcional.",
    inputSchema: alertsAckInput,
    roles: editorRoles,
    plans: ["pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = alertsAckInput.parse(rawInput ?? {});

      const alert = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.alertEvent.findUnique({ where: { id: input.alertId } })
      );

      if (!alert) {
        throw new McpError(404, "E_ALERT_NOT_FOUND", "Alert not found.");
      }

      await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.auditLog.create({
          data: {
            organizationId: ctx.tenantId,
            actor: ctx.user.id,
            action: "ALERT_ACK",
            entity: "alert_event",
            entityId: input.alertId,
            diff: input.comment ? { comment: input.comment } : Prisma.JsonNull,
            requestId: ctx.request.id,
            traceId: (ctx.request.headers["traceparent"] as string) ?? null,
          },
        })
      );

      return { ok: true };
    },
  },
  {
    name: "checkins.list",
    title: "Listar check-ins",
    description: "Lista check-ins registrados para objetivos/indicadores.",
    inputSchema: checkinsListInput,
    roles: editorRoles,
    plans: ["pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = checkinsListInput.parse(rawInput ?? {});
      const { objectiveId, indicatorId, from, to, limit, cursor } = input;
      const decodedCursor = decodeCursor(cursor);

      const checkins = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
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
                        {
                          id: { lt: decodedCursor.id },
                        },
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
      );

      let nextCursor: string | null = null;
      if (checkins.length > limit) {
        const last = checkins.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.createdAt.toISOString(),
        });
      }

      return createListPage(
        checkins.map((checkin) => ({
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
        limit,
        nextCursor
      );
    },
  },
  {
    name: "checkins.create",
    title: "Registrar check-in",
    description: "Cria um novo check-in textual para um indicador ou objetivo.",
    inputSchema: checkinsCreateInput,
    roles: editorRoles,
    plans: ["pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      ensureRole(ctx, editorRoles, "Only editors or above can create check-ins.");
      const input = checkinsCreateInput.parse(rawInput ?? {});

      if (input.indicatorId) {
        const indicatorExists = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
          tx.indicatorDefinition.findUnique({ where: { id: input.indicatorId } })
        );

        if (!indicatorExists) {
          throw new McpError(400, "E_CHECKIN_INDICATOR_NOT_FOUND", "Indicator not found.");
        }
      }

      const checkin = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.checkin.create({
          data: {
            organizationId: ctx.tenantId,
            indicatorId: input.indicatorId ?? null,
            userId: ctx.user.id,
            note: input.summary,
          },
          include: {
            user: true,
          },
        })
      );

      return {
        id: checkin.id,
        indicatorId: checkin.indicatorId,
        note: checkin.note,
        createdBy: {
          id: checkin.userId,
          email: checkin.user.email,
          name: checkin.user.name,
        },
        createdAt: checkin.createdAt.toISOString(),
      };
    },
  },
  {
    name: "agents.register",
    title: "Registrar agente",
    description: "Cria um novo agente on-premise e retorna o segredo inicial.",
    inputSchema: agentsRegisterInput,
    roles: adminRoles,
    plans: ["enterprise"],
    handler: async (ctx, rawInput) => {
      ensureRole(ctx, adminRoles, "Only admins or owners can register agents.");
      const input = agentsRegisterInput.parse(rawInput ?? {});

      const secret = generateSecret();
      const agent = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.agent.create({
          data: {
            organizationId: ctx.tenantId,
            name: input.name,
            status: AgentStatus.ACTIVE,
            secretHash: hashSecret(secret),
          },
        })
      );

      return {
        agent_id: agent.id,
        agent_secret: secret,
      };
    },
  },
  {
    name: "agents.rotateSecret",
    title: "Rotacionar segredo do agente",
    description: "Gera e devolve um novo segredo para o agente informado.",
    inputSchema: agentsRotateInput,
    roles: adminRoles,
    plans: ["enterprise"],
    handler: async (ctx, rawInput) => {
      ensureRole(ctx, adminRoles, "Only admins or owners can rotate agent secrets.");
      const input = agentsRotateInput.parse(rawInput ?? {});

      const secret = generateSecret();
      const agent = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.agent.update({
          where: { id: input.agentId },
          data: {
            secretHash: hashSecret(secret),
            status: AgentStatus.ACTIVE,
          },
        })
      );

      return {
        agent_id: agent.id,
        agent_secret: secret,
      };
    },
  },
  {
    name: "agents.revoke",
    title: "Revogar agente",
    description: "Revoga o agente informado, impedindo novas publicações.",
    inputSchema: agentsRotateInput,
    roles: adminRoles,
    plans: ["enterprise"],
    handler: async (ctx, rawInput) => {
      ensureRole(ctx, adminRoles, "Only admins or owners can revoke agents.");
      const input = agentsRotateInput.parse(rawInput ?? {});

      await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.agent.update({
          where: { id: input.agentId },
          data: {
            status: AgentStatus.REVOKED,
          },
        })
      );

      return { ok: true };
    },
  },
  {
    name: "billing.plan.get",
    title: "Consultar plano",
    description: "Retorna o plano comercial vigente para a organização.",
    inputSchema: billingPlanGetInput,
    roles: adminRoles,
    plans: ["free", "pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      billingPlanGetInput.parse(rawInput ?? {});

      const organization = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.organization.findUnique({
          where: { id: ctx.tenantId },
          select: { billingPlan: true },
        })
      );

      if (!organization) {
        throw new McpError(404, "E_TENANT_NOT_FOUND", "Organization not found.");
      }

      const plan = organization.billingPlan.toLowerCase() as McpPlan;

      return {
        plan,
      };
    },
  },
  {
    name: "billing.plan.set",
    title: "Atualizar plano",
    description: "Atualiza o plano comercial da organização.",
    inputSchema: billingPlanSetInput,
    roles: adminRoles,
    plans: ["free", "pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      ensureRole(ctx, adminRoles, "Only admins or owners can change the plan.");
      const input = billingPlanSetInput.parse(rawInput ?? {});

      const updated = await ctx.fastify.withTenant(ctx.tenantId, async (tx) => {
        const current = await tx.organization.findUnique({
          where: { id: ctx.tenantId },
          select: { billingPlan: true },
        });

        if (!current) {
          throw new McpError(404, "E_TENANT_NOT_FOUND", "Organization not found.");
        }

        const newPlan = input.plan.toUpperCase() as PrismaBillingPlan;
        if (current.billingPlan === newPlan) {
          return { plan: input.plan, changed: false };
        }

        await tx.organization.update({
          where: { id: ctx.tenantId },
          data: { billingPlan: newPlan },
        });

        await tx.auditLog.create({
          data: {
            organizationId: ctx.tenantId,
            actor: ctx.user.id,
            action: "BILLING_PLAN_SET",
            entity: "organization",
            entityId: ctx.tenantId,
            diff: {
              from: current.billingPlan.toLowerCase(),
              to: newPlan.toLowerCase(),
            },
            requestId: ctx.request.id,
            traceId: (ctx.request.headers["traceparent"] as string) ?? null,
          },
        });

        return { plan: input.plan, changed: true };
      });

      return {
        plan: updated.plan,
        updated: updated.changed,
      };
    },
  },
  {
    name: "audit.search",
    title: "Pesquisar trilhas de auditoria",
    description: "Busca registros de auditoria com filtros opcionais.",
    inputSchema: auditSearchInput,
    roles: adminRoles,
    plans: ["pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = auditSearchInput.parse(rawInput ?? {});
      const { action, entity, from, to, limit, cursor } = input;
      const decodedCursor = decodeCursor(cursor);

      const logs = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.auditLog.findMany({
          where: {
            ...(action ? { action } : {}),
            ...(entity ? { entity } : {}),
            ...(from || to
              ? {
                  at: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                  },
                }
              : {}),
            ...(decodedCursor
              ? {
                  OR: [
                    {
                      at: {
                        lt: new Date(decodedCursor.createdAt),
                      },
                    },
                    {
                      AND: [
                        {
                          at: {
                            equals: new Date(decodedCursor.createdAt),
                          },
                        },
                        {
                          id: { lt: decodedCursor.id },
                        },
                      ],
                    },
                  ],
                }
              : {}),
          },
          orderBy: [
            { at: "desc" },
            { id: "desc" },
          ],
          take: limit + 1,
        })
      );

      let nextCursor: string | null = null;
      if (logs.length > limit) {
        const last = logs.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.at.toISOString(),
        });
      }

      return createListPage(
        logs.map((log) => ({
          id: log.id,
          action: log.action,
          entity: log.entity,
          entityId: log.entityId,
          actor: log.actor,
          diff: log.diff,
          requestId: log.requestId,
          traceId: log.traceId,
          at: log.at.toISOString(),
        })),
        limit,
        nextCursor
      );
    },
  },
  {
    name: "nai.suggest.objectiveTitle",
    title: "Sugestão de título de objetivo",
    description: "Gera três sugestões de título curto para um objetivo estratégico.",
    inputSchema: naiObjectiveTitleInput,
    rateLimit: { rpm: 30 },
    roles: naiRoles,
    plans: ["pro", "enterprise"],
    handler: async (_ctx, rawInput) => {
      const input = naiObjectiveTitleInput.parse(rawInput ?? {});
      const base = input.draft ?? "novo objetivo";
      const industry = input.industry ? `${input.industry} ` : "";
      const mission = input.mission ? `alinhado à missão de ${input.mission}` : "alinhar à estratégia";

      const suggestions = [
        {
          text: `${industry}crescimento sustentável`,
          rationale: "Enfatiza expansão com responsabilidade.",
        },
        {
          text: `${industry}${base} acelerado`,
          rationale: "Destaca urgência e direção já proposta.",
        },
        {
          text: `Excelência em ${industry || "operações"}`,
          rationale: "Foco em eficiência operacional alinhada à missão.",
        },
      ];

      return {
        suggestions,
        model: "synthetic-generator-v1",
        tokens: {
          prompt: Math.max(20, base.length / 4),
          completion: 80,
        },
      };
    },
  },
  {
    name: "nai.suggest.krName",
    title: "Sugestão de nome de KR",
    description: "Propõe nomes curtos para indicadores-chave de resultado.",
    inputSchema: naiKrNameInput,
    rateLimit: { rpm: 30 },
    roles: naiRoles,
    plans: ["pro", "enterprise"],
    handler: async (_ctx, rawInput) => {
      const input = naiKrNameInput.parse(rawInput ?? {});
      const indicator = input.indicator;
      const unitSuffix = input.unit ? ` (${input.unit})` : "";

      const ideas = [
        {
          text: `${indicator} Base${unitSuffix}`,
          rationale: "Versão direta e fácil de localizar em dashboards.",
        },
        {
          text: `${indicator} Prime${unitSuffix}`,
          rationale: "Sugere foco em excelência dentro da métrica.",
        },
        {
          text: `${indicator} Target${unitSuffix}`,
          rationale: "Evidencia convergência com metas de crescimento.",
        },
      ];

      return {
        suggestions: ideas,
        model: "synthetic-generator-v1",
        tokens: {
          prompt: Math.max(20, indicator.length / 4),
          completion: 60,
        },
      };
    },
  },
  {
    name: "nai.suggest.segmentValues",
    title: "Sugerir chaves de segmento",
    description: "Sugere combinações de segmento com base no histórico do indicador.",
    inputSchema: naiSegmentValuesInput,
    rateLimit: { rpm: 20 },
    roles: naiRoles,
    plans: ["pro", "enterprise"],
    handler: async (ctx, rawInput) => {
      const input = naiSegmentValuesInput.parse(rawInput ?? {});

      const values = await ctx.fastify.withTenant(ctx.tenantId, (tx) =>
        tx.indicatorValue.findMany({
          where: { indicatorId: input.indicatorId },
          select: { segmentKey: true },
          take: 100,
        })
      );

      const seen = new Map<string, number>();
      for (const entry of values) {
        const segment = entry.segmentKey as SegmentKey | null;
        if (!segment) continue;
        const sorted = canonicalizeSegmentKey(segment);
        const fingerprint = JSON.stringify(sorted);
        seen.set(fingerprint, (seen.get(fingerprint) ?? 0) + 1);
      }

      const suggestions = Array.from(seen.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([raw, score]) => ({
          segment: JSON.parse(raw),
          score,
        }));

      if (!suggestions.length) {
        suggestions.push({ segment: { scope: "global" }, score: 1 });
      }

      return {
        suggestions,
        model: "synthetic-generator-v1",
        tokens: {
          prompt: 50,
          completion: 30,
        },
      };
    },
  },
  {
    name: "nai.explain.status",
    title: "Explicar status",
    description: "Gera uma explicação curta para o status de um indicador versus a meta.",
    inputSchema: naiExplainStatusInput,
    rateLimit: { rpm: 20 },
    roles: naiRoles,
    plans: ["pro", "enterprise"],
    handler: async (_ctx, rawInput) => {
      const input = naiExplainStatusInput.parse(rawInput ?? {});
      const status = input.status ?? "on_track";

      const tone = status === "behind" ? "alert" : status === "at_risk" ? "cautious" : "confident";
      const valuePart = input.value !== undefined && input.target !== undefined
        ? ` (${input.value} vs ${input.target})`
        : "";
      const period = input.period ? ` em ${input.period}` : "";

      const explanation =
        status === "behind"
          ? `O indicador ${input.indicator}${period} está abaixo do alvo${valuePart}. Recomenda-se revisar ações corretivas e priorizar iniciativas de impacto rápido.`
          : status === "at_risk"
          ? `O indicador ${input.indicator}${period} apresenta risco de desvio${valuePart}. Ajuste o plano de ação e monitore semanalmente.`
          : `O indicador ${input.indicator}${period} segue alinhado à meta${valuePart}. Mantenha as iniciativas atuais e monitore tendências.`;

      return {
        explanation,
        tone,
        model: "synthetic-generator-v1",
      };
    },
  },
];

export const mcpPrompts: McpPromptDefinition[] = [
  {
    uri: "prompt://objective.title.v1",
    title: "Template de título de objetivo",
    description: "Prompt base para sugerir título de objetivo.",
    inputSchema: naiObjectiveTitleInput,
    outputSchema: z.object({ output: z.string() }),
    template:
      "Considere a missão \"{{mission}}\" e o setor \"{{industry}}\" para propor um título curto para o objetivo: {{draft}}.",
    roles: naiRoles,
    plans: ["pro", "enterprise"],
  },
  {
    uri: "prompt://segment.hints.v1",
    title: "Dicas de segmentação",
    description: "Prompt que auxilia a gerar sugestões de segmentação.",
    inputSchema: z
      .object({
        indicator: z.string(),
        sampleValues: z.array(z.any()).optional(),
      })
      .default({}),
    outputSchema: z.object({ output: z.string() }),
    template:
      "Para o indicador \"{{indicator}}\" sugira chaves de segmentação adicionais considerando os exemplos: {{sampleValues}}.",
    roles: naiRoles,
    plans: ["pro", "enterprise"],
  },
  {
    uri: "prompt://kr.copy.v1",
    title: "Copy para KR",
    description: "Prompt para gerar microcopy explicativa de um indicador/KR.",
    inputSchema: z
      .object({
        indicator: z.string(),
        goal: z.string().optional(),
        frequency: z.string().optional(),
      })
      .default({}),
    outputSchema: z.object({ output: z.string() }),
    template:
      "Escreva uma descrição curta e motivadora para o indicador {{indicator}}, alinhando-o ao objetivo {{goal}} com atualização {{frequency}}.",
    roles: naiRoles,
    plans: ["pro", "enterprise"],
  },
];

export const mcpResources: McpResourceDefinition[] = [
  {
    uri: "res://glossary/segments",
    title: "Glossário de Segmentos",
    description: "Chaves sugeridas para segmentação padrão.",
    mime: "application/json",
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    data: () => ({
      segments: [
        { key: "region", description: "Região geográfica (ex.: LATAM, EMEA, APAC)." },
        { key: "channel", description: "Canal de aquisição ou atendimento (ex.: inbound, partner)." },
        { key: "tier", description: "Segmento de clientes por plano/receita (ex.: SMB, MidMarket, Enterprise)." },
      ],
    }),
  },
  {
    uri: "res://docs/indicatorTemplates",
    title: "Templates de Indicadores",
    description: "Modelos prontos de KR/KPI com campos recomendados.",
    mime: "application/json",
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    data: () => ({
      templates: [
        {
          code: "MRR",
          name: "Monthly Recurring Revenue",
          description: "Receita recorrente mensal consolidada.",
          granularity: "MONTH",
          segments: ["region", "tier"],
        },
        {
          code: "NPS",
          name: "Net Promoter Score",
          description: "Satisfação do cliente por faixa de relacionamento.",
          granularity: "MONTH",
          segments: ["region", "channel"],
        },
        {
          code: "CHURN",
          name: "Churn Rate",
          description: "Percentual de churn de clientes ativos.",
          granularity: "MONTH",
          segments: ["tier"],
        },
      ],
    }),
  },
  {
    uri: "res://policy/limits",
    title: "Limites por Plano",
    description: "Resumo de quotas e ferramentas habilitadas por plano.",
    mime: "application/json",
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    data: () => {
      const toolByPlan = (plan: McpPlan) =>
        mcpTools
          .filter((tool) => !tool.plans || tool.plans.includes(plan))
          .map((tool) => tool.name);

      const promptByPlan = (plan: McpPlan) =>
        mcpPrompts
          .filter((prompt) => !prompt.plans || prompt.plans.includes(plan))
          .map((prompt) => prompt.uri);

      return {
        plans: {
          free: {
            rpm: planCaps.free.rpm,
            sse: planCaps.free.sse,
            websocket: planCaps.free.websocket,
            tools: toolByPlan("free"),
            prompts: promptByPlan("free"),
          },
          pro: {
            rpm: planCaps.pro.rpm,
            sse: planCaps.pro.sse,
            websocket: planCaps.pro.websocket,
            tools: toolByPlan("pro"),
            prompts: promptByPlan("pro"),
          },
          enterprise: {
            rpm: planCaps.enterprise.rpm,
            sse: planCaps.enterprise.sse,
            websocket: planCaps.enterprise.websocket,
            tools: toolByPlan("enterprise"),
            prompts: promptByPlan("enterprise"),
          },
        },
      };
    },
  },
  {
    uri: "res://help/onboarding",
    title: "Ajuda do Onboarding",
    description: "Passo a passo resumido para finalizar o onboarding.",
    mime: "text/markdown",
    roles: viewerRoles,
    plans: ["free", "pro", "enterprise"],
    data: () => `
# Onboarding rápido

1. Convide os membros chave da organização.
2. Configure timezone, moeda e convenções de segmentos.
3. Cadastre objetivos e indicadores prioritários.
4. Conecte o Agente ou defina o fluxo manual de valores.

Use o MCP para consultar objetivos e indicadores com \`tools/call\`.
    `.trim(),
  },
];

export const filterAccessible = <
  T extends { roles?: RoleType[]; plans?: McpPlan[] }
>(items: T[], ctx: Pick<McpContext, "user" | "plan">) =>
  items.filter((item) => {
    const roleAllowed = !item.roles || item.roles.includes(ctx.user.role);
    const planAllowed = !item.plans || item.plans.includes(ctx.plan);
    return roleAllowed && planAllowed;
  });
