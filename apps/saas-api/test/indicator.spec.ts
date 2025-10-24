import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "@/app";
import type { PrismaMock } from "./support/prismaMock";
import { createPrismaMock } from "./support/prismaMock";
import { hashSegmentKey } from "@/lib/segment";

const demoUserId = "11111111-1111-4111-8111-111111111111";
const demoOrgId = "22222222-2222-4222-8222-222222222222";
const indicatorId = "33333333-3333-4333-8333-333333333333";

describe("Indicator values", () => {
  let prisma: PrismaMock;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      {
        indicator_id: indicatorId,
        period_start_utc: new Date("2024-10-01T00:00:00Z"),
        granularity: "MONTH",
        segment_key: { scope: "global" },
        segment_hash: hashSegmentKey({ scope: "global" }),
        value: 100,
        version: 1,
        source: "agent",
        lineage_batch_id: "batch-1",
        lineage_checksum: "checksum-1",
        updated_at: new Date("2024-10-02T12:00:00Z"),
      },
    ]);

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
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns latest indicator values", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/indicators/${indicatorId}/values?latestOnly=true`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].value).toBe(100);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});
