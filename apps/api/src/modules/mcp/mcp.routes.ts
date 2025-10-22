import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { PlanName } from '@prisma/client';
import { cadenceEnum } from '../objectives/objective.schemas';
import { createIndicatorDefinition } from '../objectives/objective.routes';
import { upsertTargets, parseRange as parseIndicatorRange } from '../indicators/indicator.routes';
import { ingestIndicatorValue } from '../agents/agent.routes';
import { enforceLimitCapacity, enforceFeatureEnabled, loadTenantPlan } from '../../utils/plan';
import { recordAudit } from '../../utils/audit';

type JsonRpcId = string | number | null;

type ToolHandler = (opts: {
  app: FastifyInstance;
  request: FastifyRequest;
  args: unknown;
}) => Promise<unknown>;

type ToolDefinition = {
  name: string;
  description: string;
  plans: PlanName[];
  roles: string[];
  input: z.ZodTypeAny;
  output: z.ZodTypeAny;
  handler: ToolHandler;
};

const mcpFeatureKey = 'mcp';

const planPricing: Record<
  PlanName,
  {
    amount: number;
    currency: string;
    billingPeriod: 'monthly' | 'annual' | 'custom';
  }
> = {
  FREE: { amount: 0, currency: 'BRL', billingPeriod: 'monthly' },
  PRO: { amount: 890, currency: 'BRL', billingPeriod: 'monthly' },
  ENTERPRISE: { amount: 0, currency: 'BRL', billingPeriod: 'custom' }
};

const isoDateString = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')
  .transform((value) => new Date(value));

const segmentInputSchema = z
  .array(
    z.object({
      axis: z.string().min(1),
      values: z.array(z.string().min(1)).min(1)
    })
  )
  .default([]);

const objectiveCreateInput = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  cadence: cadenceEnum,
  startDate: isoDateString,
  endDate: isoDateString,
  finalize: z.boolean().optional().default(true),
  segments: segmentInputSchema
});

const objectiveSegmentInput = z.object({
  objectiveId: z.string().uuid(),
  segments: segmentInputSchema
});

const objectiveCompleteInput = z.object({
  objectiveId: z.string().uuid()
});

const indicatorDirectionEnum = z.enum(['INCREASE', 'DECREASE', 'MAINTAIN']);

const indicatorBaseInput = z.object({
  objectiveId: z.string().uuid().optional(),
  title: z.string().min(3),
  description: z.string().min(10),
  cadence: cadenceEnum,
  unitCode: z.string(),
  unitCustom: z.string().optional(),
  direction: indicatorDirectionEnum,
  startDate: isoDateString,
  endDate: isoDateString,
  segments: segmentInputSchema
});

const indicatorTargetsInput = z.object({
  indicatorId: z.string().uuid(),
  targets: z.array(
    z.object({
      period: z.string().nullable().optional(),
      targetValue: z.number(),
      tolerance: z.number().nullable().optional(),
      baseline: z.number().nullable().optional()
    })
  )
});

const indicatorValuesListInput = z.object({
  indicatorId: z.string().uuid(),
  range: z.string().optional(),
  segment: z.union([z.string(), z.record(z.string())]).optional(),
  latestVersion: z.boolean().optional().default(false)
});

const agentBatchIngestInput = z.object({
  indicatorId: z.string().uuid(),
  period: z.string().min(1),
  value: z.number(),
  segmentKey: z.union([z.string(), z.record(z.string())]).optional(),
  checksum: z.string().min(1),
  batchId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  readRows: z.number().int().nonnegative().optional(),
  aggregatedRows: z.number().int().positive().optional()
});

const planUpgradePreviewInput = z.object({
  to: z.enum(['PRO', 'ENTERPRISE'])
});

const tools: ToolDefinition[] = [];

const tool = (definition: ToolDefinition) => {
  tools.push(definition);
};

const segmentsToCreate = (segments: Array<{ axis: string; values: string[] }>) =>
  segments.map((segment) => ({
    label: segment.axis,
    code: slug(segment.axis),
    values: segment.values.map((value) => ({
      value,
      code: slug(value)
    }))
  }));

tool({
  name: 'objective.create',
  description: 'Cria um novo objetivo estratégico.',
  plans: ['FREE', 'PRO', 'ENTERPRISE'],
  roles: ['ORG_OWNER', 'MANAGER'],
  input: objectiveCreateInput,
  output: z.object({ objectiveId: z.string().uuid(), status: z.string() }),
  handler: async ({ app, request, args }) => {
    const parsed = objectiveCreateInput.parse(args);
    return request.withTenantScope(async (tx) => {
      const ctx = request.getTenantContext();
      await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });
      const currentCount = await tx.objective.count({ where: { orgId: ctx.orgId } });
      await enforceLimitCapacity({
        app,
        tx,
        ctx,
        limitKey: 'objectives',
        currentCount
      });

      const objective = await tx.objective.create({
        data: {
          orgId: ctx.orgId,
          title: parsed.title,
          description: parsed.description,
          cadence: parsed.cadence,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          status: parsed.finalize ? 'ACTIVE' : 'DRAFT',
          segments: parsed.segments.length
            ? {
                create: segmentsToCreate(parsed.segments)
              }
            : undefined
        }
      });

      await recordAudit({
        tx,
        ctx,
        entity: 'Objective',
        entityId: objective.id,
        action: 'CREATE_MCP',
        before: null,
        after: objective
      });

      return { objectiveId: objective.id, status: objective.status };
    });
  }
});

tool({
  name: 'objective.segment',
  description: 'Atualiza os segmentos de um objetivo.',
  plans: ['FREE', 'PRO', 'ENTERPRISE'],
  roles: ['ORG_OWNER', 'MANAGER'],
  input: objectiveSegmentInput,
  output: z.object({ updated: z.literal(true) }),
  handler: async ({ app, request, args }) => {
    const parsed = objectiveSegmentInput.parse(args);
    return request.withTenantScope(async (tx) => {
      const ctx = request.getTenantContext();
      await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });

      const objective = await tx.objective.findFirst({
        where: { id: parsed.objectiveId, orgId: ctx.orgId }
      });
      if (!objective) throw app.httpErrors.notFound('objective not found');

      await tx.objectiveSegmentValue.deleteMany({ where: { axis: { objectiveId: parsed.objectiveId } } });
      await tx.objectiveSegmentAxis.deleteMany({ where: { objectiveId: parsed.objectiveId } });
      await tx.objective.update({
        where: { id: parsed.objectiveId },
        data: {
          segments: {
            create: segmentsToCreate(parsed.segments)
          }
        }
      });

      await recordAudit({
        tx,
        ctx,
        entity: 'Objective',
        entityId: parsed.objectiveId,
        action: 'SEGMENTS_UPDATED_MCP',
        before: objective,
        after: parsed.segments
      });

      return { updated: true as const };
    });
  }
});

tool({
  name: 'objective.complete',
  description: 'Finaliza um objetivo (status ACTIVE).',
  plans: ['FREE', 'PRO', 'ENTERPRISE'],
  roles: ['ORG_OWNER', 'MANAGER'],
  input: objectiveCompleteInput,
  output: z.object({ status: z.string() }),
  handler: async ({ app, request, args }) => {
    const parsed = objectiveCompleteInput.parse(args);

    return request.withTenantScope(async (tx) => {
      const ctx = request.getTenantContext();
      await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });

      const objective = await tx.objective.findFirst({ where: { id: parsed.objectiveId, orgId: ctx.orgId } });
      if (!objective) throw app.httpErrors.notFound('objective not found');

      const updated = await tx.objective.update({
        where: { id: parsed.objectiveId },
        data: { status: 'ACTIVE', archivedAt: null }
      });

      await recordAudit({
        tx,
        ctx,
        entity: 'Objective',
        entityId: parsed.objectiveId,
        action: 'STATUS_UPDATE_MCP',
        before: objective,
        after: updated
      });

      return { status: updated.status };
    });
  }
});

const indicatorCreateInput = indicatorBaseInput
  .extend({
    type: z.literal('KR'),
    objectiveId: z.string().uuid()
  })
  .refine((payload) => Boolean(payload.objectiveId), {
    message: 'objectiveId is required for KR',
    path: ['objectiveId']
  });

tool({
  name: 'kr.create',
  description: 'Cria um novo K-Result associado a um objetivo.',
  plans: ['FREE', 'PRO', 'ENTERPRISE'],
  roles: ['ORG_OWNER', 'MANAGER'],
  input: indicatorCreateInput,
  output: z.object({ indicatorId: z.string().uuid() }),
  handler: async ({ app, request, args }) => {
    const parsed = indicatorCreateInput.parse(args);
    return createIndicatorThroughMcp({ app, request, input: parsed });
  }
});

const kpiCreateInput = indicatorBaseInput.extend({
  type: z.literal('KPI')
});

tool({
  name: 'kpi.create',
  description: 'Cria um novo KPI (indicador operacional).',
  plans: ['FREE', 'PRO', 'ENTERPRISE'],
  roles: ['ORG_OWNER', 'MANAGER'],
  input: kpiCreateInput,
  output: z.object({ indicatorId: z.string().uuid() }),
  handler: async ({ app, request, args }) => {
    const parsed = kpiCreateInput.parse(args);
    return createIndicatorThroughMcp({ app, request, input: parsed });
  }
});

tool({
  name: 'indicator.targets.upsert',
  description: 'Substitui as metas de um indicador.',
  plans: ['FREE', 'PRO', 'ENTERPRISE'],
  roles: ['ORG_OWNER', 'MANAGER'],
  input: indicatorTargetsInput,
  output: z.object({ count: z.number().int().nonnegative() }),
  handler: async ({ app, request, args }) => {
    const parsed = indicatorTargetsInput.parse(args);
    return request.withTenantScope(async (tx) => {
      const ctx = request.getTenantContext();
      await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });

      const indicator = await tx.indicatorDefinition.findFirst({ where: { id: parsed.indicatorId, orgId: ctx.orgId } });
      if (!indicator) throw app.httpErrors.notFound('indicator not found');

      await upsertTargets(tx, parsed.indicatorId, parsed.targets);

      await recordAudit({
        tx,
        ctx,
        entity: 'IndicatorDefinition',
        entityId: parsed.indicatorId,
        action: 'TARGETS_UPDATED_MCP',
        before: null,
        after: parsed.targets
      });

      return { count: parsed.targets.length };
    });
  }
});

tool({
  name: 'indicator.values.list',
  description: 'Lista valores (séries) de um indicador.',
  plans: ['FREE', 'PRO', 'ENTERPRISE'],
  roles: ['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'],
  input: indicatorValuesListInput,
  output: z.object({
    series: z.array(
      z.object({
        period: z.string(),
        value: z.number(),
        status: z.string(),
        segmentKey: z.string().nullable(),
        version: z.number().int().nonnegative(),
        collectedAt: z.string()
      })
    )
  }),
  handler: async ({ app, request, args }) => {
    const parsed = indicatorValuesListInput.parse(args);

    return request.withTenantScope(async (tx) => {
      const ctx = request.getTenantContext();
      await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });

      const indicator = await tx.indicatorDefinition.findFirst({
        where: { id: parsed.indicatorId, orgId: ctx.orgId },
        select: { id: true }
      });
      if (!indicator) throw app.httpErrors.notFound('indicator not found');

      const [startPeriod, endPeriod] = parseIndicatorRange(parsed.range);
      const segmentKey = normaliseSegmentKey(parsed.segment);

      const series = await tx.indicatorValue.findMany({
        where: {
          indicatorId: parsed.indicatorId,
          ...(segmentKey ? { segmentKey } : {}),
          ...(startPeriod || endPeriod
            ? {
                period: {
                  ...(startPeriod ? { gte: startPeriod } : {}),
                  ...(endPeriod ? { lte: endPeriod } : {})
                }
              }
            : {})
        },
        orderBy: [{ period: 'asc' }, { version: parsed.latestVersion ? 'desc' : 'asc' }]
      });

      const deduped = parsed.latestVersion
        ? dedupeLatestVersion(series)
        : series;

      return {
        series: deduped.map((row) => ({
          period: row.period,
          value: row.value,
          status: row.statusCalc,
          segmentKey: row.segmentKey,
          version: row.version,
          collectedAt: row.collectedAt.toISOString()
        }))
      };
    });
  }
});

tool({
  name: 'agent.batch.ingest',
  description: 'Ingere um lote de valores por meio do Data Inova Agent.',
  plans: ['ENTERPRISE'],
  roles: ['ORG_OWNER'],
  input: agentBatchIngestInput,
  output: z.object({
    status: z.enum(['accepted', 'duplicate']),
    batchId: z.string().uuid(),
    indicatorValueId: z.string().uuid().optional(),
    version: z.number().int().nonnegative().optional()
  }),
  handler: async ({ app, request, args }) => {
    const parsed = agentBatchIngestInput.parse(args);

    return request.withTenantScope(async (tx) => {
      const ctx = request.getTenantContext();
      await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });
      await enforceFeatureEnabled({ app, tx, ctx, featureKey: 'agent' });

      const agentId =
        parsed.agentId ??
        (
          await tx.agent.findFirst({
            where: { orgId: ctx.orgId, status: 'ACTIVE' },
            orderBy: { lastSeenAt: 'desc' }
          })
        )?.id;

      if (!agentId) {
        throw app.httpErrors.badRequest('agentId is required when no active agent is registered');
      }

      const result = await ingestIndicatorValue(app, tx, {
        agentId,
        payload: {
          indicatorId: parsed.indicatorId,
          period: parsed.period,
          value: parsed.value,
          segmentKey: normaliseSegmentKey(parsed.segmentKey),
          checksum: parsed.checksum,
          batchId: parsed.batchId,
          readRows: parsed.readRows,
          aggregatedRows: parsed.aggregatedRows
        },
        ctx
      });

      return result;
    });
  }
});

tool({
  name: 'plan.upgrade.preview',
  description: 'Simula um upgrade de plano e retorna limites e precificação.',
  plans: ['FREE', 'PRO', 'ENTERPRISE'],
  roles: ['ORG_OWNER'],
  input: planUpgradePreviewInput,
  output: z.object({
    plan: z.enum(['PRO', 'ENTERPRISE']),
    currentPlan: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
    price: z.object({
      amount: z.number(),
      currency: z.string(),
      billingPeriod: z.enum(['monthly', 'annual', 'custom'])
    }),
    limits: z.record(z.string(), z.unknown()),
    features: z.record(z.string(), z.unknown())
  }),
  handler: async ({ app, request, args }) => {
    const parsed = planUpgradePreviewInput.parse(args);

    return request.withTenantScope(async (tx) => {
      const ctx = request.getTenantContext();
      await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });

      const { plan: currentPlan } = await loadTenantPlan(tx, ctx);

      const targetPlan = await tx.plan.findFirst({
        where: { name: parsed.to }
      });
      if (!targetPlan) {
        throw app.httpErrors.notFound('plan not found');
      }

      const price = planPricing[parsed.to];
      if (!price) {
        throw app.httpErrors.internalServerError(`pricing not configured for plan ${parsed.to}`);
      }

      return {
        plan: parsed.to,
        currentPlan: currentPlan.name,
        price,
        limits: (targetPlan.limits ?? {}) as Record<string, unknown>,
        features: (targetPlan.features ?? {}) as Record<string, unknown>
      };
    });
  }
});

const prompts = [
  {
    name: 'draft-objective-from-mission',
    description: 'Gera sugestões de objetivos a partir de missão/visão.',
    template:
      'Missão: {{mission}}\nVisão: {{vision}}\nSugira 3 objetivos estratégicos alinhados, com cadência proposta e resultados esperados.'
  },
  {
    name: 'segment-suggestions',
    description: 'Sugere eixos/segmentos frequentes com base em contexto.',
    template:
      'Contexto: {{context}}\nListe eixos de segmentação relevantes (ex.: Região, Canal, Persona) e exemplos de valores.'
  }
];

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional().default(null),
  method: z.string(),
  params: z.unknown().optional()
});

export const registerMcpRoutes = (app: FastifyInstance) => {
  app.post('/mcp', async (request, reply) => {
    const body = jsonRpcRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send(buildErrorResponse(null, 40001, 'ValidationError', body.error.flatten()));
    }

    const rpc = body.data;

    try {
      switch (rpc.method) {
        case 'tools/list':
          return reply.send(await handleToolsList(app, request, rpc.id));
        case 'tools/call':
          return reply.send(await handleToolsCall(app, request, rpc.id, rpc.params));
        case 'resources/list':
          return reply.send(await handleResourcesList(app, request, rpc.id));
        case 'resources/read':
          return reply.send(await handleResourcesRead(app, request, rpc.id, rpc.params));
        case 'prompts/list':
          return reply.send(handlePromptsList(rpc.id));
        case 'prompts/get':
          return reply.send(handlePromptsGet(rpc.id, rpc.params));
        default:
          return reply.status(200).send(buildErrorResponse(rpc.id, 40400, 'MethodNotFound'));
      }
    } catch (error) {
      const mapped = await mapError(app, request, rpc.id, error);
      return reply.status(200).send(mapped);
    }
  });
};

const handleToolsList = async (app: FastifyInstance, request: FastifyRequest, id: JsonRpcId) => {
  const ctx = request.getTenantContext();
  const plan = await request.withTenantScope(async (tx) => {
    await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });
    const { plan } = await loadTenantPlan(tx, ctx);
    return plan.name;
  });

  const available = tools
    .filter((tool) => tool.plans.includes(plan as PlanName))
    .filter((tool) => hasRequiredRole(ctx.roles, tool.roles))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      plans: tool.plans,
      roles: tool.roles,
      inputSchema: zodToJsonSchema(tool.input),
      outputSchema: zodToJsonSchema(tool.output)
    }));

  return buildResultResponse(id, { tools: available });
};

const handleToolsCall = async (
  app: FastifyInstance,
  request: FastifyRequest,
  id: JsonRpcId,
  params: unknown
) => {
  const schema = z.object({
    name: z.string(),
    arguments: z.unknown().optional(),
    idempotencyKey: z.string().optional()
  });

  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return buildErrorResponse(id, 40001, 'ValidationError', parsed.error.flatten());
  }

  const { name, arguments: args } = parsed.data;
  const definition = tools.find((tool) => tool.name === name);
  if (!definition) {
    return buildErrorResponse(id, 40400, 'ToolNotFound');
  }

  const ctx = request.getTenantContext();
  const plan = await request.withTenantScope(async (tx) => {
    await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });
    const { plan } = await loadTenantPlan(tx, ctx);
    return plan.name;
  });

  if (!definition.plans.includes(plan as PlanName)) {
    return buildErrorResponse(id, 40300, 'PlanNotEligible');
  }

  if (!hasRequiredRole(ctx.roles, definition.roles)) {
    return buildErrorResponse(id, 40300, 'RoleNotAllowed');
  }

  const start = Date.now();

  try {
    const data = await definition.handler({ app, request, args });

    await request.withTenantScope(async (tx) => {
      await tx.mcpToolInvocationLog.create({
        data: {
          orgId: ctx.orgId,
          tool: name,
          payload: (args ?? {}) as Record<string, unknown>,
          durationMs: Date.now() - start,
          success: true
        }
      });
    });

    return buildResultResponse(id, { ok: true, data });
  } catch (error) {
    await request.withTenantScope(async (tx) => {
      await tx.mcpToolInvocationLog.create({
        data: {
          orgId: ctx.orgId,
          tool: name,
          payload: (args ?? {}) as Record<string, unknown>,
          durationMs: Date.now() - start,
          success: false,
          error: (error as Error).message
        }
      });
    });

    throw error;
  }
};

const handleResourcesList = async (app: FastifyInstance, request: FastifyRequest, id: JsonRpcId) => {
  request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
  const ctx = request.getTenantContext();

  const resources = await request.withTenantScope(async (tx) => {
    await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });

    const objectives = await tx.objective.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const indicators = await tx.indicatorDefinition.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const objectiveResources = objectives.map((objective) => ({
      uri: `objective://${objective.id}`,
      description: objective.title
    }));

    const indicatorResources = indicators.flatMap((indicator) => [
      {
        uri: `indicator://${indicator.id}`,
        description: indicator.title
      },
      {
        uri: `indicator://${indicator.id}/values`,
        description: `${indicator.title} valores`
      }
    ]);

    return [...objectiveResources, ...indicatorResources];
  });

  return buildResultResponse(id, { resources });
};

const handleResourcesRead = async (
  app: FastifyInstance,
  request: FastifyRequest,
  id: JsonRpcId,
  params: unknown
) => {
  request.requireRoles(['ORG_OWNER', 'MANAGER', 'CONTRIBUTOR', 'VIEWER']);
  const schema = z.object({ uri: z.string() });
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return buildErrorResponse(id, 40001, 'ValidationError', parsed.error.flatten());
  }

  const ctx = request.getTenantContext();
  const { uri } = parsed.data;

  const result = await request.withTenantScope(async (tx) => {
    await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });
    const { scheme, id: resourceId, query } = parseResourceUri(uri);

    if (scheme === 'objective') {
      const objective = await tx.objective.findFirst({
        where: { id: resourceId, orgId: ctx.orgId },
        include: {
          segments: { include: { values: true } },
          indicators: {
            include: {
              segments: { include: { values: true } },
              targets: true
            }
          }
        }
      });
      if (!objective) throw app.httpErrors.notFound('objective not found');
      return objective;
    }

    if (scheme === 'indicator') {
      const indicator = await tx.indicatorDefinition.findFirst({
        where: { id: resourceId, orgId: ctx.orgId },
        include: {
          segments: { include: { values: true } },
          targets: true
        }
      });
      if (!indicator) throw app.httpErrors.notFound('indicator not found');

      if (query?.values) {
        const [startPeriod, endPeriod] = parseIndicatorRange(query.values.range);
        const segmentKey = query.values.segment ? normaliseSegmentKey(query.values.segment) : undefined;

        const values = await tx.indicatorValue.findMany({
          where: {
            indicatorId: resourceId,
            ...(segmentKey ? { segmentKey } : {}),
            ...(startPeriod || endPeriod
              ? {
                  period: {
                    ...(startPeriod ? { gte: startPeriod } : {}),
                    ...(endPeriod ? { lte: endPeriod } : {})
                  }
                }
              : {})
          },
          orderBy: [{ period: 'asc' }, { version: 'asc' }]
        });

        return {
          indicatorId: resourceId,
          values: values.map((value) => ({
            ...value,
            collectedAt: value.collectedAt.toISOString()
          }))
        };
      }

      return indicator;
    }

    throw app.httpErrors.notFound('resource not found');
  });

  await request.withTenantScope(async (tx) => {
    await recordAudit({
      tx,
      ctx,
      entity: 'McpResource',
      entityId: uri,
      action: 'READ_RESOURCE',
      before: null,
      after: { uri }
    });
  });

  return buildResultResponse(id, { data: result });
};

const handlePromptsList = (id: JsonRpcId) =>
  buildResultResponse(id, {
    prompts: prompts.map(({ name, description }) => ({ name, description }))
  });

const handlePromptsGet = (id: JsonRpcId, params: unknown) => {
  const parsed = z.object({ name: z.string() }).safeParse(params);
  if (!parsed.success) {
    return buildErrorResponse(id, 40001, 'ValidationError', parsed.error.flatten());
  }

  const prompt = prompts.find((entry) => entry.name === parsed.data.name);
  if (!prompt) {
    return buildErrorResponse(id, 40400, 'PromptNotFound');
  }

  return buildResultResponse(id, prompt);
};

const hasRequiredRole = (userRoles: string[], required: string[]) =>
  required.length === 0 || required.some((role) => userRoles.includes(role));

const buildResultResponse = (id: JsonRpcId, result: unknown) => ({
  jsonrpc: '2.0' as const,
  id,
  result
});

const buildErrorResponse = (id: JsonRpcId, code: number, message: string, data?: unknown) => ({
  jsonrpc: '2.0' as const,
  id,
  error: {
    code,
    message,
    ...(data ? { data } : {})
  }
});

const mapError = async (
  app: FastifyInstance,
  request: FastifyRequest,
  id: JsonRpcId,
  error: unknown
) => {
  if (error instanceof ZodError) {
    return buildErrorResponse(id, 40001, 'ValidationError', error.flatten());
  }

  const err = error as { statusCode?: number; code?: string; message?: string };
  const status = err.statusCode ?? 500;
  const message = err.message ?? 'Internal error';

  const map: Record<number, number> = {
    400: 40001,
    401: 40100,
    403: 40300,
    404: 40400,
    409: 40900,
    429: 42900,
    500: 50000
  };

  const code = map[status] ?? 50000;

  app.log.error({ err: error }, 'mcp error');

  return buildErrorResponse(id, code, status >= 500 ? 'InternalError' : message, status >= 500 ? undefined : err);
};

const parseResourceUri = (uri: string) => {
  const [schemePart, pathPart] = uri.split('://');
  if (!pathPart) {
    throw new Error('invalid resource uri');
  }

  const [path, queryString] = pathPart.split('?');
  const [id, ...rest] = path.split('/');

  const query = queryString ? parseQueryString(queryString) : undefined;
  if (rest[0] === 'values') {
    return {
      scheme: 'indicator' as const,
      id,
      query: { values: query ?? {} }
    };
  }

  return { scheme: schemePart, id, query } as
    | { scheme: 'objective'; id: string; query?: Record<string, unknown> }
    | { scheme: 'indicator'; id: string; query?: Record<string, unknown> };
};

const parseQueryString = (query: string): Record<string, any> => {
  const params = new URLSearchParams(query);
  const result: Record<string, any> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const normaliseSegmentKey = (segment?: string | Record<string, string>) => {
  if (!segment) return undefined;
  if (typeof segment === 'string') return segment;
  const ordered = Object.keys(segment)
    .sort()
    .map((key) => `${key}=${segment[key]}`)
    .join(';');
  return ordered;
};

const dedupeLatestVersion = <T extends { period: string; version: number }>(rows: T[]) => {
  const map = new Map<string, T>();
  for (const row of rows) {
    const existing = map.get(row.period);
    if (!existing || existing.version < row.version) {
      map.set(row.period, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));
};

const slug = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'SEGMENT';

const createIndicatorThroughMcp = async ({
  app,
  request,
  input
}: {
  app: FastifyInstance;
  request: FastifyRequest;
  input: z.infer<typeof indicatorBaseInput> & { type: 'KR' | 'KPI' };
}) => {
  return request.withTenantScope(async (tx) => {
    const ctx = request.getTenantContext();
    await enforceFeatureEnabled({ app, tx, ctx, featureKey: mcpFeatureKey });

    const currentCount = await tx.indicatorDefinition.count({ where: { orgId: ctx.orgId } });
    await enforceLimitCapacity({
      app,
      tx,
      ctx,
      limitKey: 'indicators',
      currentCount
    });

    const payload = {
      objectiveId: input.objectiveId,
      type: input.type,
      title: input.title,
      description: input.description,
      cadence: input.cadence,
      unitCode: input.unitCode,
      unitCustom: input.unitCustom,
      direction: input.direction,
      startDate: input.startDate,
      endDate: input.endDate,
      segments: segmentsToCreate(input.segments)
    };

    const indicator = await createIndicatorDefinition(app, tx, {
      orgId: ctx.orgId,
      payload
    });

    await recordAudit({
      tx,
      ctx,
      entity: 'IndicatorDefinition',
      entityId: indicator.id,
      action: 'CREATE_MCP',
      before: null,
      after: indicator
    });

    return { indicatorId: indicator.id };
  });
};
