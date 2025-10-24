import { createHash } from "crypto";
import {
  ConnectorType,
  PeriodGranularity,
  Prisma,
  PrismaClient,
  PublishState,
  RunState,
  Severity,
} from "@prisma/client";

const prisma = new PrismaClient();

type SegmentKey = Record<string, string | number | boolean>;

const canonicalizeSegmentKey = (segment: SegmentKey) =>
  Object.fromEntries(
    Object.entries(segment).sort(([a], [b]) => a.localeCompare(b))
  );

const hashSegmentKey = (segment: SegmentKey) =>
  Buffer.from(
    createHash("sha256")
      .update(JSON.stringify(canonicalizeSegmentKey(segment)))
      .digest()
  );

async function main() {
  const agentConfigId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const connectorId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const queryCodeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const indicatorId = "44444444-4444-4444-8444-444444444444"; // aligns with SaaS seed
  const runId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const batchId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const syncIndicatorId = indicatorId;
  const syncTargetId = "77777777-7777-4777-8777-777777777777";

  await prisma.$transaction(async (tx) => {
    // Configuração base do agente
    await tx.agentConfig.upsert({
      where: { id: agentConfigId },
      update: {
        saasBaseUrl: "https://api.datainova.local",
        orgTz: "America/Sao_Paulo",
      },
      create: {
        id: agentConfigId,
        tenantId: "11111111-1111-4111-8111-111111111111",
        agentId: "55555555-5555-4555-8555-555555555555",
        saasBaseUrl: "https://api.datainova.local",
        orgTz: "America/Sao_Paulo",
      },
    });

    const connector = await tx.connector.upsert({
      where: { id: connectorId },
      update: { status: "HEALTHY", lastOkAt: new Date() },
      create: {
        id: connectorId,
        agentId: agentConfigId,
        name: "ERP Postgres",
        type: ConnectorType.POSTGRES,
        dsnRef: "secret://connectors/erp",
        allowlist: [] satisfies Prisma.JsonArray,
        status: "HEALTHY",
        lastOkAt: new Date(),
      },
    });

    await tx.connectorHealth.create({
      data: {
        connectorId: connector.id,
        status: "HEALTHY",
        rttMs: 42,
        checkedAt: new Date(),
        details: { message: "Connection OK" },
      },
    });

    const queryCode = await tx.queryCode.upsert({
      where: { id: queryCodeId },
      update: {
        sql: "select period_start, sum(amount) as value from demo_view group by 1",
        checksum: "demo-sql-checksum",
      },
      create: {
        id: queryCodeId,
        indicatorId,
        version: 1,
        checksum: "demo-sql-checksum",
        sql: "select period_start, sum(amount) as value from demo_view group by 1",
        mapping: {
          segmentKeys: ["country", "channel"],
          valueColumn: "value",
        },
        connectorId: connector.id,
        vcsRef: "git://repo@rev",
      },
    });

    await tx.syncIndicator.upsert({
      where: { id: syncIndicatorId },
      update: {
        name: "Monthly Recurring Revenue",
        etag: "demo-etag",
      },
      create: {
        id: syncIndicatorId,
        code: "MRR",
        name: "Monthly Recurring Revenue",
        direction: "UP",
        granularityDefault: PeriodGranularity.MONTH,
        tolerance: null,
        etag: "demo-etag",
      },
    });

    await tx.syncTarget.upsert({
      where: { id: syncTargetId },
      update: { targetValue: new Prisma.Decimal("150000"), segmentKey: { scope: "global" } },
      create: {
        id: syncTargetId,
        indicatorId: syncIndicatorId,
        periodStartUtc: new Date(Date.UTC(2024, 9, 1)),
        granularity: PeriodGranularity.MONTH,
        targetValue: new Prisma.Decimal("150000"),
        segmentKey: { scope: "global" },
      },
    });

    const segmentKey = { country: "BR", channel: "Direct" } satisfies SegmentKey;
    const segmentHash = hashSegmentKey(segmentKey);

    const run = await tx.run.upsert({
      where: { id: runId },
      update: {
        state: RunState.SUCCEEDED,
        finishedAt: new Date(),
        queryCodeId: queryCode.id,
        stats: { rows: 12, duration_ms: 180 },
      },
      create: {
        id: runId,
        indicatorId,
        periodStartUtc: new Date(Date.UTC(2024, 9, 1)),
        granularity: PeriodGranularity.MONTH,
        state: RunState.SUCCEEDED,
        attempt: 1,
        startedAt: new Date(),
        finishedAt: new Date(),
        queryCodeId: queryCode.id,
        stats: { rows: 12, duration_ms: 180 },
      },
    });

    await tx.runResult.upsert({
      where: { id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
      update: {
        segmentKey,
        segmentHash,
        value: new Prisma.Decimal("132500.87"),
      },
      create: {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        runId: run.id,
        periodStartUtc: new Date(Date.UTC(2024, 9, 1)),
        granularity: PeriodGranularity.MONTH,
        segmentKey,
        segmentHash,
        value: new Prisma.Decimal("132500.87"),
      },
    });

    await tx.outboxBatch.upsert({
      where: { id: batchId },
      update: {
        state: PublishState.OK,
        saasRequestId: "req-123",
        publishedAt: new Date(),
      },
      create: {
        id: batchId,
        runId: run.id,
        batchId: "agent-demo-2024-10",
        checksum: "demo-batch-checksum",
        state: PublishState.OK,
        attempt: 1,
        saasRequestId: "req-123",
        publishedAt: new Date(),
      },
    });

    await tx.outboxItem.upsert({
      where: { id: "99999999-9999-4999-8999-999999999999" },
      update: {
        segmentKey,
        segmentHash,
        value: new Prisma.Decimal("132500.87"),
      },
      create: {
        id: "99999999-9999-4999-8999-999999999999",
        outboxBatchId: batchId,
        indicatorId,
        periodStartUtc: new Date(Date.UTC(2024, 9, 1)),
        granularity: PeriodGranularity.MONTH,
        segmentKey,
        segmentHash,
        value: new Prisma.Decimal("132500.87"),
      },
    });

    await tx.validationIssue.create({
      data: {
        runId: run.id,
        rule: "staleness_under_threshold",
        severity: Severity.INFO,
        details: { daysWithoutUpdate: 2 },
      },
    });

    await tx.auditLocal.create({
      data: {
        actor: "system",
        action: "run_completed",
        entity: "run",
        entityId: run.id,
        diff: { state: "SUCCEEDED" },
        requestId: "req-local-1",
      },
    });

    await tx.kvStore.upsert({
      where: { key: "sync.indicators/etag" },
      update: { value: { etag: "demo-etag" } },
      create: { key: "sync.indicators/etag", value: { etag: "demo-etag" } },
    });
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Agent seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
