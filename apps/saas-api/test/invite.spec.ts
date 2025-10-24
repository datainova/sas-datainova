import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "date-fns";

import { buildApp } from "@/app";
import type { PrismaMock } from "./support/prismaMock";
import { createPrismaMock } from "./support/prismaMock";

const demoUserId = "11111111-1111-4111-8111-111111111111";
const demoOrgId = "22222222-2222-4222-8222-222222222222";

describe("Invite routes", () => {
  let prisma: PrismaMock;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.invite.findMany.mockResolvedValue([]);
    prisma.invite.create.mockResolvedValue({
      id: "55555555-5555-4555-8555-555555555555",
      email: "new.user@datainova.demo",
      role: "EDITOR",
      token: "invite-token",
      expiresAt: addDays(new Date(), 7),
      acceptedAt: null,
      createdAt: new Date(),
    });
    prisma.refreshToken.create.mockResolvedValue({});

    app = await buildApp({ prisma: prisma as any });
    (app as any).withTenant = async (_tenantId: string, fn: any) => fn(prisma);

    token = app.jwt.sign({
      sub: demoUserId,
      email: "owner@datainova.demo",
      organizationId: demoOrgId,
      role: "OWNER",
      type: "access",
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a new invite", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/invites",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "new.user@datainova.demo", role: "EDITOR" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.token).toBeTruthy();
    expect(prisma.invite.create).toHaveBeenCalled();
  });

  it("lists invites", async () => {
    prisma.invite.findMany.mockResolvedValue([
      {
        id: "55555555-5555-4555-8555-555555555555",
        email: "new.user@datainova.demo",
        role: "EDITOR",
        token: "invite-token",
        expiresAt: addDays(new Date(), 7),
        acceptedAt: null,
        createdAt: new Date(),
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/v1/invites",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
  });
});
