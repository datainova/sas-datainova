import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AgentStatus,
  IngestStatus,
  PeriodGranularity,
  Prisma,
} from "@prisma/client";
import { createHash, createHmac } from "crypto";
import { sendProblem } from "@/http/problem";
import {
  canonicalizeSegmentKey,
  hashSegmentKey,
  SegmentKey,
} from "@/lib/segment";
import {
  isPeriodAligned,
  normalizePeriodStart,
} from "@/lib/period";

const ingestBodySchema = z.object({
  items: z
    .array(
      z.object({
        indicator_id: z.string().uuid(),
        period_start: z.string().datetime(),
        granularity: z.nativeEnum(PeriodGranularity),
        segment_key: z
          .record(
            z.string(),
            z.union([z.string(), z.number(), z.boolean()])
          )
          .default({}),
        value: z.number(),
      })
    )
    .min(1),
});

const ingestResponseSchema = z.object({
  accepted: z.number(),
  duplicate: z.number(),
  conflict: z.number(),
});

const parseSignature = (header?: string | string[]) => {
  if (!header || Array.isArray(header)) return null;
  const [algorithm, hash] = header.split("=");
  if (!algorithm || !hash) return null;
  if (algorithm.toLowerCase() !== "sha256") return null;
  return hash.trim();
};

const checksumBatch = (items: Array<z.infer<typeof ingestBodySchema>["items"][0]>) => {
  const sorted = [...items].sort((a, b) =>
    a.indicator_id.localeCompare(b.indicator_id)
  );
  const canonicalized = sorted.map((item) => ({
    indicator_id: item.indicator_id,
    period_start: item.period_start,
    granularity: item.granularity,
    segment_key: canonicalizeSegmentKey(item.segment_key) ?? {},
    value: item.value,
  }));

  const serialized = JSON.stringify(canonicalized);
  return createHash("sha256").update(serialized).digest("hex");
};

const deriveAgentKey = (secretHash: string) => {
  if (/^[0-9a-f]{64}$/i.test(secretHash)) {
    return Buffer.from(secretHash, "hex");
  }
  return Buffer.from(secretHash, "utf-8");
};

export const ingestRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();
    router.post(
    "/ingest/indicator-values",
    {
      preHandler: fastify.authenticate,
      schema: {
        body: ingestBodySchema,
        response: {
          202: ingestResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const agentId = request.headers["x-agent-id"] as string | undefined;
      const batchId = request.headers["x-batch-id"] as string | undefined;
      const signatureHeader = request.headers["x-signature"];

      if (!agentId || !batchId) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_INGEST_HEADERS_REQUIRED",
          detail: "X-Agent-Id and X-Batch-Id headers are required.",
        });
      }

      const signature = parseSignature(signatureHeader);
      if (!signature) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_INGEST_SIGNATURE_INVALID",
          detail: "X-Signature header must follow sha256=<signature> pattern.",
        });
      }

      const rawBody =
        request.rawBody ??
        JSON.stringify({
          items: request.body.items,
        });

      const { organization, agent } = await fastify.withTenant(
        tenantId,
        async (tx) => {
          const [organization, agent] = await Promise.all([
            tx.organization.findUnique({ where: { id: tenantId } }),
            tx.agent.findUnique({ where: { id: agentId } }),
          ]);
          return { organization, agent };
        }
      );

      if (!agent || !organization) {
        return sendProblem(reply, request, {
          status: 401,
          code: "E_INGEST_AGENT_NOT_FOUND",
          detail: "Agent not found.",
        });
      }

      if (agent.status !== AgentStatus.ACTIVE) {
        return sendProblem(reply, request, {
          status: 403,
          code: "E_INGEST_AGENT_INACTIVE",
          detail: "Agent is not active.",
        });
      }

      const key = deriveAgentKey(agent.secretHash);
      const expectedSignature = createHmac("sha256", key)
        .update(rawBody)
        .digest("hex");

      if (expectedSignature !== signature) {
        return sendProblem(reply, request, {
          status: 401,
          code: "E_INGEST_SIGNATURE_MISMATCH",
          detail: "Invalid agent signature.",
        });
      }

      const checksum = checksumBatch(request.body.items);

      let result: { accepted: number; duplicate: number; conflict: number };

      try {
        result = await fastify.withTenant(tenantId, async (tx) => {
          const existingBatch = await tx.ingestBatch.findUnique({
            where: {
              organizationId_batchId: {
                organizationId: tenantId,
                batchId,
              },
            },
          });

          if (existingBatch) {
            if (existingBatch.checksum === checksum) {
              return {
                accepted: 0,
                duplicate: existingBatch.itemsCount,
                conflict: 0,
              };
            }

            throw new Error("conflict_existing_batch");
          }

          const ingestBatch = await tx.ingestBatch.create({
            data: {
              organizationId: tenantId,
              agentId: agentId,
              batchId,
              checksum,
              status: IngestStatus.RECEIVED,
              itemsCount: request.body.items.length,
            },
          });

          let accepted = 0;
          let duplicate = 0;
          let conflict = 0;

          for (const item of request.body.items) {
            if (
              !isPeriodAligned(
                item.period_start,
                item.granularity,
                organization.tz
              )
            ) {
              conflict += 1;
              continue;
            }

            const indicator = await tx.indicatorDefinition.findUnique({
              where: { id: item.indicator_id },
            });

            if (!indicator) {
              conflict += 1;
              continue;
            }

            const normalizedPeriod = normalizePeriodStart(
              item.period_start,
              item.granularity,
              organization.tz
            );

            const canonical = canonicalizeSegmentKey(item.segment_key);
            const segmentHash = hashSegmentKey(canonical);

            await tx.ingestItem.create({
              data: {
                ingestBatchId: ingestBatch.id,
                indicatorId: item.indicator_id,
                periodStartUtc: normalizedPeriod,
                granularity: item.granularity,
                segmentKey: canonical ?? {},
                segmentHash,
                value: new Prisma.Decimal(item.value),
                status: IngestStatus.RECEIVED,
              },
            });

            const latest = await tx.indicatorValue.findFirst({
              where: {
                indicatorId: item.indicator_id,
                periodStartUtc: normalizedPeriod,
                segmentHash,
              },
              orderBy: {
                version: "desc",
              },
            });

            if (latest && latest.lineageBatchId === batchId) {
              duplicate += 1;
              continue;
            }

            if (
              latest &&
              Number(latest.value) !== item.value &&
              latest.source === "agent"
            ) {
              conflict += 1;
              continue;
            }

            const nextVersion = latest ? latest.version + 1 : 1;

            await tx.indicatorValue.create({
              data: {
                organizationId: tenantId,
                indicatorId: item.indicator_id,
                periodStartUtc: normalizedPeriod,
                granularity: item.granularity,
                segmentKey: canonical ?? {},
                segmentHash,
                value: new Prisma.Decimal(item.value),
                version: nextVersion,
                source: "agent",
                lineageBatchId: batchId,
                lineageChecksum: checksum,
              },
            });

            accepted += 1;
          }

          await tx.ingestBatch.update({
            where: { id: ingestBatch.id },
            data: {
              status:
                conflict > 0
                  ? IngestStatus.CONFLICT
                  : accepted > 0
                  ? IngestStatus.MERGED
                  : IngestStatus.DUPLICATE,
              mergedAt: conflict > 0 ? null : new Date(),
              errorMessage:
                conflict > 0
                  ? "Conflicts detected during ingest processing."
                  : null,
              itemsCount: request.body.items.length,
            },
          });

          if (conflict > 0) {
            throw new Error("ingest_conflict");
          }

          return { accepted, duplicate, conflict };
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "conflict_existing_batch"
        ) {
          return sendProblem(reply, request, {
            status: 409,
            code: "E_INGEST_BATCH_CONFLICT",
            detail:
              "Batch with the same identifier already processed with different checksum.",
          });
        }

        if (error instanceof Error && error.message === "ingest_conflict") {
          return sendProblem(reply, request, {
            status: 409,
            code: "E_INGEST_CONFLICT",
            detail:
              "Ingest batch contains conflicting values compared to the latest state.",
          });
        }

        throw error;
      }

      return reply.status(202).send(result);
    }
  );
};
