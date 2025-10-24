import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrganizationSize } from "@prisma/client";

import { buildApp } from "@/app";
import type { PrismaMock } from "./support/prismaMock";
import { createPrismaMock } from "./support/prismaMock";

const demoUserId = "11111111-1111-4111-8111-111111111111";
const demoOrgId = "22222222-2222-4222-8222-222222222222";

describe("Onboarding routes", () => {
  let prisma: PrismaMock;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;
  const now = new Date();

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.onboardingSession.create.mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
      userId: demoUserId,
      organizationId: demoOrgId,
      step: "welcome",
      status: "ACTIVE",
      state: {},
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    prisma.onboardingSession.findUnique.mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
      userId: demoUserId,
      organizationId: demoOrgId,
      step: "mission",
      status: "ACTIVE",
      state: {
        answers: {
          companyName: "DataInova Demo",
        },
        completedSteps: ["welcome", "company"],
      },
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    prisma.onboardingSession.update.mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
      userId: demoUserId,
      organizationId: demoOrgId,
      step: "mission",
      status: "ACTIVE",
      state: {},
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    prisma.organization.findUnique.mockResolvedValue({
      name: "DataInova Demo",
      tz: "America/Sao_Paulo",
      currency: "BRL",
      locale: "pt-BR",
      countryCode: "BR",
      countryName: "Brasil",
      segmentKey: "technology",
      segmentLabel: "Tecnologia",
      size: OrganizationSize.SIZE_51_200,
      sizeLabel: "51–200 pessoas",
      mission: null,
      vision: null,
      summary: null,
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

  it("creates an onboarding session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/onboarding/sessions",
      headers: { authorization: `Bearer ${token}` },
      payload: { step: "welcome" },
    });

    expect(response.statusCode).toBe(201);
    expect(prisma.onboardingSession.create).toHaveBeenCalled();
    const body = response.json();
    expect(body.state.answers.companyName).toBe("DataInova Demo");
    expect(body.state.completedSteps).toContain("company");
  });

  it("updates onboarding step", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/onboarding/sessions/66666666-6666-4666-8666-666666666666/step",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        step: "mission",
        payload: { mission: "Acelerar crescimento sustentavel." },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.state.answers.mission).toBe("Acelerar crescimento sustentavel.");
    expect(body.state.completedSteps).toContain("mission");
  });
});
