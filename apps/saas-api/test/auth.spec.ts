import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import argon2 from "argon2";
import { buildApp } from "@/app";
import type { PrismaMock } from "./support/prismaMock";
import { createPrismaMock } from "./support/prismaMock";

const demoUserId = "11111111-1111-4111-8111-111111111111";
const demoOrgId = "22222222-2222-4222-8222-222222222222";
const demoOrgNickname = "data-inova-demo";

describe("Auth routes", () => {
  let prisma: PrismaMock;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.$executeRaw.mockResolvedValue(null);
    prisma.refreshToken.create.mockResolvedValue({});
    prisma.emailVerificationToken.create.mockResolvedValue({});
    prisma.emailVerificationToken.findUnique.mockResolvedValue(null);
    prisma.emailVerificationToken.update.mockResolvedValue({});
    prisma.passwordResetToken.create.mockResolvedValue({});
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);
    prisma.passwordResetToken.update.mockResolvedValue({});

    app = await buildApp({ prisma: prisma as any });
    (app as any).withTenant = async (_tenantId: string, fn: any) => fn(prisma);
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("initiates signup with email only", async () => {
    prisma.userAccount.findUnique.mockResolvedValue(null);
    prisma.userAccount.create.mockResolvedValue({
      id: demoUserId,
      email: "cto@datainova.demo",
      name: null,
      isActive: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: {
        email: "cto@datainova.demo",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(prisma.userAccount.create).toHaveBeenCalled();
    expect(prisma.organization.create).not.toHaveBeenCalled();
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.verification.token).toBeTruthy();
  });

  it("authenticates an existing user", async () => {
    prisma.userAccount.findUnique.mockResolvedValue({
      id: demoUserId,
      email: "cto@datainova.demo",
      passwordHash: "hashed",
      isActive: true,
      name: "CTO Demo",
    });

    prisma.organizationMember.findFirst.mockResolvedValue({
      id: "member",
      organizationId: demoOrgId,
      userId: demoUserId,
      role: "OWNER",
    });

    prisma.organization.findUnique.mockResolvedValue({
      id: demoOrgId,
      name: "DataInova Demo",
      nickname: demoOrgNickname,
      tz: "America/Sao_Paulo",
      currency: "BRL",
      locale: "pt-BR",
    });

    vi.spyOn(argon2, "verify").mockResolvedValue(true as any);

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "cto@datainova.demo",
        password: "StrongP@ss123",
        organizationId: demoOrgId,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.role).toBe("OWNER");
    expect(body.organization.id).toBe(demoOrgId);
    expect(body.organization.nickname).toBe(demoOrgNickname);
  });

  it("authenticates an existing user using organization nickname", async () => {
    prisma.userAccount.findUnique.mockResolvedValue({
      id: demoUserId,
      email: "cto@datainova.demo",
      passwordHash: "hashed",
      isActive: true,
      name: "CTO Demo",
    });

    prisma.organizationMember.findFirst.mockResolvedValue({
      id: "member",
      organizationId: demoOrgId,
      userId: demoUserId,
      role: "OWNER",
    });

    prisma.organization.findUnique.mockResolvedValue({
      id: demoOrgId,
      name: "DataInova Demo",
      nickname: demoOrgNickname,
      tz: "America/Sao_Paulo",
      currency: "BRL",
      locale: "pt-BR",
    });

    vi.spyOn(argon2, "verify").mockResolvedValue(true as any);

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "cto@datainova.demo",
        password: "StrongP@ss123",
        organizationNickname: demoOrgNickname,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.organization.nickname).toBe(demoOrgNickname);
  });

  it("completes signup using verification token", async () => {
    const rawToken = "token-value";
    const hashed = (await import("@/lib/tokens")).hashToken(rawToken);

    prisma.emailVerificationToken.findUnique.mockImplementation((args: any) => {
      const { where } = args;
      if (where.tokenHash === hashed) {
        return Promise.resolve({
          id: "verif-id",
          tokenHash: hashed,
          userId: demoUserId,
          expiresAt: new Date(Date.now() + 3_600_000),
          consumedAt: null,
          user: {
            id: demoUserId,
            email: "cto@datainova.demo",
            name: null,
            isActive: false,
          },
        } as any);
      }
      return Promise.resolve(null);
    });

    prisma.organizationMember.findFirst.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({
      id: demoOrgId,
      name: "DataInova Demo",
      nickname: demoOrgNickname,
      tz: "America/Sao_Paulo",
      currency: "BRL",
      locale: "pt-BR",
    });
    prisma.organizationMember.create.mockResolvedValue({
      id: "member",
      organizationId: demoOrgId,
      userId: demoUserId,
      role: "OWNER",
    });
    prisma.userAccount.update.mockResolvedValue({
      id: demoUserId,
      email: "cto@datainova.demo",
      name: "CTO Demo",
      isActive: true,
    });
    prisma.refreshToken.create.mockResolvedValue({});

    const hashSpy = vi
      .spyOn(argon2, "hash")
      .mockResolvedValue("hashed-password");

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/signup/complete",
      payload: {
        token: rawToken,
        name: "CTO Demo",
        password: "StrongP@ss123",
        organization: {
          name: "DataInova Demo",
          tz: "America/Sao_Paulo",
          currency: "BRL",
          locale: "pt-BR",
          nickname: demoOrgNickname,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.emailVerificationToken.update).toHaveBeenCalled();
    expect(prisma.organization.create).toHaveBeenCalled();
    expect(prisma.organizationMember.create).toHaveBeenCalled();
    expect(prisma.userAccount.update).toHaveBeenCalled();
    expect(hashSpy).toHaveBeenCalledWith("StrongP@ss123", expect.any(Object));
    const body = response.json();
    expect(body.user.id).toBe(demoUserId);
    expect(body.organization.nickname).toBe(demoOrgNickname);
  });

  it("issues password reset token", async () => {
    prisma.userAccount.findUnique.mockResolvedValueOnce({
      id: demoUserId,
      email: "cto@datainova.demo",
      isActive: true,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/password/forgot",
      payload: { email: "cto@datainova.demo" },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.resetToken).toBeTruthy();
  });
});
