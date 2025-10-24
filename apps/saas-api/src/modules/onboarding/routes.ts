import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma } from "@prisma/client";
import { OrganizationSize } from "@prisma/client";
import { z } from "zod";

import { sendProblem } from "@/http/problem";

const onboardingSteps = [
  "welcome",
  "company",
  "country",
  "segment",
  "size",
  "mission",
  "vision",
  "review",
] as const;

const onboardingStepSchema = z.enum(onboardingSteps);
type OnboardingStep = (typeof onboardingSteps)[number];

const sessionStatusSchema = z.enum(["ACTIVE", "COMPLETED"]);

const sizeLabels: Record<OrganizationSize, string> = {
  [OrganizationSize.SIZE_1_10]: "1–10 pessoas",
  [OrganizationSize.SIZE_11_50]: "11–50 pessoas",
  [OrganizationSize.SIZE_51_200]: "51–200 pessoas",
  [OrganizationSize.SIZE_201_1000]: "201–1.000 pessoas",
  [OrganizationSize.SIZE_1001_PLUS]: "1.001+ pessoas",
};

const companyNameSchema = z
  .string()
  .min(2)
  .max(120)
  .transform((value) => value.trim());

const missionSchema = z
  .string()
  .min(20)
  .max(360)
  .transform((value) => value.trim());

const visionSchema = z
  .string()
  .min(20)
  .max(360)
  .transform((value) => value.trim());

const summarySchema = z
  .string()
  .min(20)
  .max(400)
  .transform((value) => value.trim());

const countrySchema = z
  .object({
    code: z
      .string()
      .min(2)
      .max(2)
      .transform((value) => value.trim().toUpperCase()),
    name: z
      .string()
      .min(1)
      .max(120)
      .transform((value) => value.trim()),
    timezone: z
      .string()
      .min(1)
      .max(100)
      .transform((value) => value.trim()),
    currency: z
      .string()
      .min(1)
      .max(10)
      .transform((value) => value.trim().toUpperCase()),
    locale: z
      .string()
      .min(2)
      .max(10)
      .transform((value) => value.trim().replace(/_/g, "-")),
  })
  .strict();

const segmentSchema = z
  .object({
    value: z.string().min(2).max(120),
    label: z.string().min(2).max(120).optional(),
  })
  .transform(({ value, label }) => {
    const canonical = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const finalLabel = (label ?? value).trim();
    return {
      value: canonical || value.trim().toLowerCase(),
      label: finalLabel || canonical || value.trim(),
    };
  });

const sizeSchema = z
  .object({
    value: z.preprocess(
      (raw) => (typeof raw === "string" ? raw.trim().toUpperCase() : raw),
      z.nativeEnum(OrganizationSize)
    ),
    label: z.string().min(2).max(80).optional(),
  })
  .transform(({ value, label }) => ({
    value,
    label: label?.trim() && label.trim().length > 0 ? label.trim() : sizeLabels[value],
  }));

const onboardingAnswersSchema = z
  .object({
    companyName: companyNameSchema,
    country: countrySchema,
    segment: segmentSchema,
    size: sizeSchema,
    mission: missionSchema,
    vision: visionSchema,
    summary: summarySchema,
  })
  .partial()
  .strict();

const onboardingStateSchema = z
  .object({
    answers: onboardingAnswersSchema.default({}),
    completedSteps: z.array(onboardingStepSchema).default([]),
    lastCompletedAt: z.string().datetime().optional(),
  })
  .default({ answers: {}, completedSteps: [] });

const onboardingSessionResponse = z.object({
  id: z.string().uuid(),
  step: onboardingStepSchema,
  status: sessionStatusSchema,
  state: onboardingStateSchema,
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});

const createSessionBodySchema = z.object({
  step: onboardingStepSchema.default("welcome"),
  state: onboardingStateSchema.optional(),
});

const stepUpdateBodySchema = z.object({
  step: onboardingStepSchema,
  payload: z.unknown().optional(),
});

const completeBodySchema = z.object({
  organization: z
    .object({
      name: z.string().min(1).optional(),
      tz: z.string().min(1).optional(),
      currency: z.string().min(1).optional(),
      locale: z.string().min(2).max(10).optional(),
    })
    .optional(),
});

type OnboardingState = z.infer<typeof onboardingStateSchema>;
type OnboardingAnswers = OnboardingState["answers"];

const requiredStepsForCompletion: OnboardingStep[] = [
  "company",
  "country",
  "segment",
  "size",
  "mission",
  "vision",
];

const stepPayloadParsers: Record<
  OnboardingStep,
  (payload: unknown) => Partial<OnboardingAnswers>
> = {
  welcome: () => ({}),
  company: (payload) => {
    if (!hasPayload(payload)) {
      return {};
    }
    const data = z.object({ companyName: companyNameSchema }).parse(payload);
    return { companyName: data.companyName };
  },
  country: (payload) => {
    if (!hasPayload(payload)) {
      return {};
    }
    const data = z.object({ country: countrySchema }).parse(payload);
    return { country: data.country };
  },
  segment: (payload) => {
    if (!hasPayload(payload)) {
      return {};
    }
    const data = z.object({ segment: segmentSchema }).parse(payload);
    return { segment: data.segment };
  },
  size: (payload) => {
    if (!hasPayload(payload)) {
      return {};
    }
    const data = z.object({ size: sizeSchema }).parse(payload);
    return { size: data.size };
  },
  mission: (payload) => {
    if (!hasPayload(payload)) {
      return {};
    }
    const data = z.object({ mission: missionSchema }).parse(payload);
    return { mission: data.mission };
  },
  vision: (payload) => {
    if (!hasPayload(payload)) {
      return {};
    }
    const data = z.object({ vision: visionSchema }).parse(payload);
    return { vision: data.vision };
  },
  review: (payload) => {
    if (!hasPayload(payload)) {
      return {};
    }
    const data = z.object({ summary: summarySchema }).parse(payload);
    return { summary: data.summary };
  },
};

const stepOrderIndex = new Map<OnboardingStep, number>(
  onboardingSteps.map((step, index) => [step, index])
);

function hasPayload(payload: unknown): payload is Record<string, unknown> {
  return (
    payload !== null &&
    typeof payload === "object" &&
    Object.keys(payload as Record<string, unknown>).length > 0
  );
}

function pruneUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(pruneUndefined)
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const pruned = pruneUndefined(entry);
      if (pruned !== undefined) {
        result[key] = pruned;
      }
    }
    return result;
  }

  return value === undefined ? undefined : value;
}

function sortAndDedupeSteps(steps: OnboardingStep[]): OnboardingStep[] {
  const seen = new Set<OnboardingStep>(steps);
  return onboardingSteps.filter((step) => seen.has(step));
}

function computeCompletedSteps(answers: OnboardingAnswers): OnboardingStep[] {
  const completed: OnboardingStep[] = ["welcome"];
  if (answers?.companyName) {
    completed.push("company");
  }
  if (answers?.country) {
    completed.push("country");
  }
  if (answers?.segment) {
    completed.push("segment");
  }
  if (answers?.size) {
    completed.push("size");
  }
  if (answers?.mission) {
    completed.push("mission");
  }
  if (answers?.vision) {
    completed.push("vision");
  }
  if (answers?.summary) {
    completed.push("review");
  }
  return sortAndDedupeSteps(completed);
}

function mergeAnswers(
  base: OnboardingAnswers,
  patch: Partial<OnboardingAnswers>
): OnboardingAnswers {
  return {
    ...base,
    ...patch,
  };
}

function ensureState(raw: unknown): OnboardingState {
  const parsed = onboardingStateSchema.safeParse(raw ?? {});
  const base: OnboardingState = parsed.success
    ? parsed.data
    : { answers: {}, completedSteps: [] };

  const cleanedAnswers = pruneUndefined(base.answers ?? {}) as OnboardingAnswers;
  const computed = computeCompletedSteps(cleanedAnswers);
  const union = sortAndDedupeSteps([...(base.completedSteps ?? []), ...computed]);

  return {
    answers: cleanedAnswers,
    completedSteps: union.length ? union : ["welcome"],
    lastCompletedAt: base.lastCompletedAt,
  };
}

function toJsonState(state: OnboardingState): Prisma.JsonObject {
  return pruneUndefined(state) as Prisma.JsonObject;
}

type SessionForSerialization = {
  id: string;
  step: string;
  status: string;
  state: Prisma.JsonValue | null;
  updatedAt: Date;
  completedAt: Date | null;
};

function serializeSession(
  session: SessionForSerialization,
  overrideState?: OnboardingState
) {
  const state = overrideState ?? ensureState(session.state);
  const stepResult = onboardingStepSchema.safeParse(session.step);
  const statusResult = sessionStatusSchema.safeParse(session.status);
  const normalizedStep = stepResult.success ? stepResult.data : "welcome";
  const normalizedStatus = statusResult.success ? statusResult.data : "ACTIVE";

  const payload = {
    id: session.id,
    step: normalizedStep,
    status: normalizedStatus,
    state,
    updatedAt: session.updatedAt.toISOString(),
    ...(session.completedAt ? { completedAt: session.completedAt.toISOString() } : {}),
  };

  return onboardingSessionResponse.parse(payload);
}

async function buildPrefillAnswers(
  fastify: any,
  tenantId: string
): Promise<Partial<OnboardingAnswers>> {
  const organization = await fastify.withTenant(tenantId, (tx: Prisma.TransactionClient) =>
    tx.organization.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        tz: true,
        currency: true,
        locale: true,
        countryCode: true,
        countryName: true,
        segmentKey: true,
        segmentLabel: true,
        size: true,
        sizeLabel: true,
        mission: true,
        vision: true,
        summary: true,
      },
    })
  );

  if (!organization) {
    return {};
  }

  const answers: Partial<OnboardingAnswers> = {};

  if (organization.name) {
    answers.companyName = organization.name;
  }

  if (
    organization.countryCode &&
    organization.tz &&
    organization.currency &&
    organization.locale
  ) {
    answers.country = {
      code: organization.countryCode,
      name: organization.countryName ?? organization.countryCode,
      timezone: organization.tz,
      currency: organization.currency,
      locale: organization.locale,
    };
  }

  if (organization.segmentKey) {
    answers.segment = {
      value: organization.segmentKey,
      label: organization.segmentLabel ?? organization.segmentKey,
    };
  }

  if (organization.size) {
    answers.size = {
      value: organization.size,
      label: organization.sizeLabel ?? sizeLabels[organization.size],
    };
  }

  if (organization.mission) {
    answers.mission = organization.mission;
  }

  if (organization.vision) {
    answers.vision = organization.vision;
  }

  if (organization.summary) {
    answers.summary = organization.summary;
  }

  return answers;
}

function diffCompletedSteps(
  previous: OnboardingStep[],
  next: OnboardingStep[]
): OnboardingStep[] {
  const prevSet = new Set(previous);
  return next.filter((step) => !prevSet.has(step));
}

export const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();

  router.post(
    "/onboarding/sessions",
    {
      preHandler: router.authenticate,
      schema: {
        tags: ["onboarding"],
        summary: "Cria uma nova sessão de onboarding.",
        security: [{ bearerAuth: [] }],
        body: createSessionBodySchema,
        response: {
          201: onboardingSessionResponse,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.authUser!.organizationId;
      const baseState = ensureState(request.body.state ?? {});
      const prefills = await buildPrefillAnswers(fastify, tenantId);
      const mergedAnswers = mergeAnswers(prefills as OnboardingAnswers, baseState.answers);
      const recomputed = computeCompletedSteps(mergedAnswers);
      const completedSteps = sortAndDedupeSteps([
        ...baseState.completedSteps,
        ...recomputed,
      ]);

      const normalizedState: OnboardingState = {
        answers: mergedAnswers,
        completedSteps,
        lastCompletedAt:
          diffCompletedSteps(baseState.completedSteps, completedSteps).length > 0
            ? new Date().toISOString()
            : baseState.lastCompletedAt,
      };

      const session = await fastify.prisma.onboardingSession.create({
        data: {
          userId: request.authUser!.id,
          organizationId: tenantId,
          step: request.body.step,
          status: "ACTIVE",
          state: toJsonState(normalizedState),
        },
      });

      request.log.info(
        {
          event: "onboarding_session_created",
          sessionId: session.id,
          tenantId,
          step: request.body.step,
        },
        "onboarding session created"
      );

      return reply.status(201).send(serializeSession(session, normalizedState));
    }
  );

  router.get(
    "/onboarding/sessions/active",
    {
      preHandler: router.authenticate,
      schema: {
        tags: ["onboarding"],
        summary: "Recupera a sessão de onboarding ativa do usuário.",
        security: [{ bearerAuth: [] }],
        response: {
          200: onboardingSessionResponse,
        },
      },
    },
    async (request, reply) => {
      const session = await fastify.prisma.onboardingSession.findFirst({
        where: {
          userId: request.authUser!.id,
          status: "ACTIVE",
        },
        orderBy: { updatedAt: "desc" },
      });

      if (!session) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_ONBOARDING_NOT_FOUND",
          detail: "No active onboarding session found.",
        });
      }

      return reply.send(serializeSession(session));
    }
  );

  router.get(
    "/onboarding/sessions/:id",
    {
      preHandler: router.authenticate,
      schema: {
        tags: ["onboarding"],
        summary: "Obtém uma sessão de onboarding por ID.",
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: onboardingSessionResponse,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const session = await fastify.prisma.onboardingSession.findUnique({
        where: { id },
      });

  if (!session || session.userId !== request.authUser!.id) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_ONBOARDING_NOT_FOUND",
          detail: "Onboarding session not found.",
        });
      }

      return reply.send(serializeSession(session));
    }
  );

  router.patch(
    "/onboarding/sessions/:id/step",
    {
      preHandler: router.authenticate,
      schema: {
        tags: ["onboarding"],
        summary: "Atualiza passo e estado da sessão (autosave).",
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: stepUpdateBodySchema,
        response: {
          200: onboardingSessionResponse,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { step, payload } = request.body;

      const session = await fastify.prisma.onboardingSession.findUnique({
        where: { id },
      });

      if (!session || session.userId !== request.authUser!.id) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_ONBOARDING_NOT_FOUND",
          detail: "Onboarding session not found.",
        });
      }

      const state = ensureState(session.state);
      const previousCompleted = state.completedSteps;

      if (payload !== undefined) {
        const patch = stepPayloadParsers[step](payload);
        if (Object.keys(patch).length > 0) {
          state.answers = mergeAnswers(state.answers, patch);
          state.lastCompletedAt = new Date().toISOString();
        }
      }

      const recomputed = computeCompletedSteps(state.answers);
      state.completedSteps = sortAndDedupeSteps([...state.completedSteps, ...recomputed]);

      const updated = await fastify.prisma.onboardingSession.update({
        where: { id },
        data: {
          step,
          state: toJsonState(state),
          updatedAt: new Date(),
        },
      });

      request.log.info(
        {
          event: "onboarding_step_saved",
          sessionId: id,
          tenantId: request.authUser!.organizationId,
          step,
          newlyCompleted: diffCompletedSteps(previousCompleted, state.completedSteps),
        },
        "onboarding step updated"
      );

      return reply.send(serializeSession(updated, state));
    }
  );

  router.post(
    "/onboarding/sessions/:id/complete",
    {
      preHandler: router.authenticate,
      schema: {
        tags: ["onboarding"],
        summary: "Conclui o onboarding e aplica dados na organização.",
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: completeBodySchema,
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const session = await fastify.prisma.onboardingSession.findUnique({
        where: { id },
      });

      if (!session || session.userId !== request.authUser!.id) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_ONBOARDING_NOT_FOUND",
          detail: "Onboarding session not found.",
        });
      }

      const state = ensureState(session.state);
      const answers = state.answers;
      const recomputed = computeCompletedSteps(answers);
      state.completedSteps = sortAndDedupeSteps([...state.completedSteps, ...recomputed]);

      const missingSteps = requiredStepsForCompletion.filter(
        (step) => !state.completedSteps.includes(step)
      );

      if (missingSteps.length > 0) {
        return sendProblem(reply, request, {
          status: 409,
          code: "E_ONBOARDING_INCOMPLETE",
          detail: "Complete todos os passos obrigatórios antes de finalizar.",
          context: { missingSteps },
        });
      }

      const overrides = request.body?.organization ?? {};
      const now = new Date();
      state.lastCompletedAt = now.toISOString();

      const organizationUpdate: Prisma.OrganizationUpdateInput = {
        onboardingCompletedAt: now,
      };

      const resolvedName = overrides.name ?? answers.companyName;
      if (resolvedName) {
        organizationUpdate.name = resolvedName;
      }

      const resolvedTz = overrides.tz ?? answers.country?.timezone;
      if (resolvedTz) {
        organizationUpdate.tz = resolvedTz;
      }

      const resolvedCurrency = overrides.currency ?? answers.country?.currency;
      if (resolvedCurrency) {
        organizationUpdate.currency = resolvedCurrency;
      }

      const resolvedLocale = overrides.locale ?? answers.country?.locale;
      if (resolvedLocale) {
        organizationUpdate.locale = resolvedLocale;
      }

      if (answers.country?.code) {
        organizationUpdate.countryCode = answers.country.code;
      }

      if (answers.country?.name) {
        organizationUpdate.countryName = answers.country.name;
      }

      if (answers.segment) {
        organizationUpdate.segmentKey = answers.segment.value;
        organizationUpdate.segmentLabel = answers.segment.label;
      }

      if (answers.size) {
        organizationUpdate.size = answers.size.value;
        organizationUpdate.sizeLabel = answers.size.label;
      }

      if (answers.mission) {
        organizationUpdate.mission = answers.mission;
      }

      if (answers.vision) {
        organizationUpdate.vision = answers.vision;
      }

      if (answers.summary) {
        organizationUpdate.summary = answers.summary;
      }

      await fastify.withTenant(request.authUser!.organizationId, (tx) =>
        tx.organization.update({
          where: { id: request.authUser!.organizationId },
          data: organizationUpdate,
        })
      );

      await fastify.prisma.onboardingSession.update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedAt: now,
          state: toJsonState(state),
          updatedAt: now,
        },
      });

      request.log.info(
        {
          event: "onboarding_completed",
          sessionId: id,
          tenantId: request.authUser!.organizationId,
        },
        "onboarding session completed"
      );

      return reply.send({ ok: true as const });
    }
  );
};
