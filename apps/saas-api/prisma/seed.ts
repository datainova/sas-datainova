import { createHash } from "crypto";
import {
  AgentStatus,
  AlertSeverity,
  IndicatorDirection,
  IngestStatus,
  PeriodGranularity,
  Prisma,
  PrismaClient,
  RoleType,
} from "@prisma/client";

const prisma = new PrismaClient();

type SegmentKey = Record<string, string | number | boolean>;

const canonicalizeSegmentKey = (segment: SegmentKey) => {
  return Object.fromEntries(
    Object.entries(segment).sort(([a], [b]) => a.localeCompare(b))
  );
};

const hashSegmentKey = (segment: SegmentKey) => {
  const canonical = canonicalizeSegmentKey(segment);
  const serialized = JSON.stringify(canonical);
  return Buffer.from(createHash("sha256").update(serialized).digest());
};

async function main() {
  const orgId = "11111111-1111-4111-8111-111111111111";
  const ownerId = "22222222-2222-4222-8222-222222222222";
  const objectiveId = "33333333-3333-4333-8333-333333333333";
  const indicatorId = "44444444-4444-4444-8444-444444444444";
  const agentId = "55555555-5555-4555-8555-555555555555";
  const ingestBatchPk = "66666666-6666-4666-8666-666666666666";
  const ingestBatchExternalId = "demo-batch-2024-10";
  const demoTenant = {
    id: orgId,
    name: "DataInova Demo",
    tz: "America/Sao_Paulo",
    currency: "BRL",
    locale: "pt-BR",
    billingPlan: "PRO" as const,
  };

  const owner = await prisma.userAccount.upsert({
    where: { email: "cto@datainova.demo" },
    update: { name: "CTO Demo", isActive: true },
    create: {
      id: ownerId,
      email: "cto@datainova.demo",
      name: "CTO Demo",
      isActive: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    // set tenant context for RLS-protected tables
    await tx.$executeRaw`
      SELECT set_config('app.organization_id', ${orgId}, true)
    `;

    await tx.organization.upsert({
      where: { id: demoTenant.id },
      update: {
        name: demoTenant.name,
        tz: demoTenant.tz,
        currency: demoTenant.currency,
        locale: demoTenant.locale,
      },
      create: demoTenant,
    });

    await tx.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: orgId, userId: owner.id },
      },
      update: { role: RoleType.OWNER },
      create: {
        organizationId: orgId,
        userId: owner.id,
        role: RoleType.OWNER,
      },
    });

    const objective = await tx.objective.upsert({
      where: { id: objectiveId },
      update: {
        name: "Crescer Receita Recorrente",
        description: "Aumentar receita recorrente mensal com foco em upsell.",
      },
      create: {
        id: objectiveId,
        organizationId: orgId,
        name: "Crescer Receita Recorrente",
        description: "Aumentar receita recorrente mensal com foco em upsell.",
        ownerId: owner.id,
      },
    });

    const indicator = await tx.indicatorDefinition.upsert({
      where: { id: indicatorId },
      update: {},
      create: {
        id: indicatorId,
        organizationId: orgId,
        objectiveId: objective.id,
        code: "MRR",
        name: "Monthly Recurring Revenue",
        direction: IndicatorDirection.UP,
        granularityDefault: PeriodGranularity.MONTH,
        tolerance: null,
        unit: "BRL",
      },
    });

    const agent = await tx.agent.upsert({
      where: { id: agentId },
      update: {},
      create: {
        id: agentId,
        organizationId: orgId,
        name: "Agente Demo",
        status: AgentStatus.ACTIVE,
        secretHash: "changeme",
      },
    });

    const segmentKey = { scope: "global" };
    const segmentHash = hashSegmentKey(segmentKey);
    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    await tx.indicatorTarget.upsert({
      where: {
        organizationId_indicatorId_periodStartUtc_segmentHash: {
          organizationId: orgId,
          indicatorId: indicator.id,
          periodStartUtc: periodStart,
          segmentHash,
        },
      },
      update: {
        targetValue: new Prisma.Decimal("150000"),
      },
      create: {
        organizationId: orgId,
        indicatorId: indicator.id,
        periodStartUtc: periodStart,
        granularity: PeriodGranularity.MONTH,
        segmentKey,
        segmentHash,
        targetValue: new Prisma.Decimal("150000"),
      },
    });

    await tx.ingestBatch.upsert({
      where: {
        organizationId_batchId: {
          organizationId: orgId,
          batchId: ingestBatchExternalId,
        },
      },
      update: {
        status: IngestStatus.MERGED,
        mergedAt: new Date(),
        itemsCount: 1,
      },
      create: {
        id: ingestBatchPk,
        organizationId: orgId,
        agentId: agent.id,
        batchId: ingestBatchExternalId,
        checksum: "demo-checksum",
        status: IngestStatus.MERGED,
        itemsCount: 1,
      },
    });

    await tx.ingestItem.create({
      data: {
        ingestBatchId: ingestBatchPk,
        indicatorId: indicator.id,
        periodStartUtc: periodStart,
        granularity: PeriodGranularity.MONTH,
        segmentKey,
        segmentHash,
        value: new Prisma.Decimal("132500.87"),
        status: IngestStatus.MERGED,
      },
    });

    await tx.indicatorValue.create({
      data: {
        organizationId: orgId,
        indicatorId: indicator.id,
        periodStartUtc: periodStart,
        granularity: PeriodGranularity.MONTH,
        segmentKey,
        segmentHash,
        value: new Prisma.Decimal("132500.87"),
        version: 1,
        source: "agent",
        lineageBatchId: ingestBatchExternalId,
        lineageChecksum: "demo-checksum",
      },
    });

    await tx.dqViolation.create({
      data: {
        organizationId: orgId,
        indicatorId: indicator.id,
        rule: "staleness_under_threshold",
        severity: AlertSeverity.INFO,
        details: { daysWithoutUpdate: 2 },
      },
    });
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
