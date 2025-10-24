import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "@/app";
import type { PrismaMock } from "./support/prismaMock";
import { createPrismaMock } from "./support/prismaMock";
import { createHash, createHmac } from "crypto";

const demoUserId = "11111111-1111-4111-8111-111111111111";
const demoOrgId = "22222222-2222-4222-8222-222222222222";
const indicatorId = "33333333-3333-4333-8333-333333333333";
const agentId = "44444444-4444-4444-8444-444444444444";

describe("Ingest endpoint", () => {
  let prisma: PrismaMock;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.organization.findUnique.mockResolvedValue({
      id: demoOrgId,
      tz: "America/Sao_Paulo",
    });

    const secret = "test-secret";
    const secretHash = createHash("sha256").update(secret).digest("hex");

    prisma.agent.findUnique.mockResolvedValue({
      id: agentId,
      organizationId: demoOrgId,
      status: "ACTIVE",
      secretHash,
    });

    prisma.ingestBatch.findUnique.mockResolvedValue(null);
    prisma.ingestBatch.create.mockResolvedValue({ id: "ingest-batch" });
    prisma.indicatorDefinition.findUnique.mockResolvedValue({
      id: indicatorId,
    });
    prisma.indicatorValue.findFirst.mockResolvedValue(null);
    prisma.indicatorValue.create.mockResolvedValue({
      id: "value-id",
    });
    prisma.ingestBatch.update.mockResolvedValue({});

    prisma.$queryRaw.mockResolvedValue([]);

    app = await buildApp({ prisma: prisma as any });
    (app as any).withTenant = async (_tenantId: string, fn: any) => fn(prisma);
    await app.ready();

    token = app.jwt.sign({
      sub: demoUserId,
      email: "cto@datainova.demo",
      organizationId: demoOrgId,
      role: "OWNER",
      type: "access",
    });

    const body = {
      items: [
        {
          indicator_id: indicatorId,
          period_start: "2024-10-01T03:00:00Z",
          granularity: "MONTH",
          segment_key: { scope: "global" },
          value: 120.5,
        },
      ],
    };

    const serialized = JSON.stringify(body);
    const signature = createHmac("sha256", Buffer.from(secretHash, "hex"))
      .update(serialized)
      .digest("hex");

    ingestRequest = {
      serialized,
      signature,
    };
  });

  afterEach(async () => {
    await app.close();
  });

  let ingestRequest: { serialized: string; signature: string };

  it("accepts a valid ingest payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/ingest/indicator-values",
      payload: JSON.parse(ingestRequest.serialized),
      headers: {
        authorization: `Bearer ${token}`,
        "x-agent-id": agentId,
        "x-batch-id": "batch-001",
        "x-signature": `sha256=${ingestRequest.signature}`,
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.accepted).toBe(1);
    expect(body.conflict).toBe(0);
    expect(prisma.indicatorValue.create).toHaveBeenCalled();
  });
});
