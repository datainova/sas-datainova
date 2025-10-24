import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "@/app";
import { env } from "@/config/env";
import type { PrismaMock } from "./support/prismaMock";
import { createPrismaMock } from "./support/prismaMock";

env.MCP_ENABLED = true;

const demoUserId = "11111111-1111-4111-8111-111111111111";
const demoOrgId = "22222222-2222-4222-8222-222222222222";

describe("MCP endpoints", () => {
  let prisma: PrismaMock;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$executeRaw.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.organization.findUnique.mockResolvedValue({
      id: demoOrgId,
      billingPlan: "PRO",
    });

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

  it("lists available tools for the caller", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/mcp",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.result.tools).toBeInstanceOf(Array);
    const toolNames = body.result.tools.map((tool: any) => tool.name);
    expect(toolNames).toContain("objectives.list");
    expect(toolNames).toContain("indicators.list");
  });

  it("executes objectives.list via tools/call", async () => {
    prisma.objective.findMany.mockResolvedValue([
      {
        id: "obj-1",
        organizationId: demoOrgId,
        name: "Expandir MRR",
        description: "Crescer base de clientes enterprise",
        ownerId: demoUserId,
        createdAt: new Date("2024-10-01T00:00:00Z"),
        updatedAt: new Date("2024-10-10T00:00:00Z"),
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/v1/mcp",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "objectives.list",
          arguments: {
            limit: 10,
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.result.items).toHaveLength(1);
    expect(body.result.items[0].name).toBe("Expandir MRR");
    expect(prisma.objective.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 11,
      })
    );
  });
});
