import { randomUUID } from 'node:crypto';
import type { PlanName, Prisma, PrismaClient } from '@prisma/client';
import { planCatalog } from './planCatalog';

export const ensureCoreRecordsWithClient = async (client: PrismaClient) => {
  const planNames = Object.keys(planCatalog) as PlanName[];

  for (const planName of planNames) {
    const definition = planCatalog[planName];

    const plan = await client.plan.upsert({
      where: { name: planName },
      update: {
        limits: definition.limits as Prisma.InputJsonValue,
        features: definition.features as Prisma.InputJsonValue
      },
      create: {
        id: randomUUID(),
        name: planName,
        limits: definition.limits as Prisma.InputJsonValue,
        features: definition.features as Prisma.InputJsonValue
      }
    });

    await client.entitlement.deleteMany({
      where: { planId: plan.id }
    });

    if (definition.entitlements.length) {
      await client.entitlement.createMany({
        data: definition.entitlements.map((entitlement) => ({
          id: randomUUID(),
          planId: plan.id,
          feature: entitlement.feature,
          limit: entitlement.limit ?? null,
          enabled: entitlement.enabled ?? true
        }))
      });
    }
  }
};
