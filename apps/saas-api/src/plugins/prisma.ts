import fp from "fastify-plugin";
import type { PrismaClient } from "@prisma/client";
import { PrismaClient as DefaultPrismaClient } from "@prisma/client";
import { withTenantTransaction } from "@/lib/tenant";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

interface PrismaPluginOptions {
  client?: PrismaClient;
}

export const prismaPlugin = fp<PrismaPluginOptions>(async (fastify, options) => {
  const prisma = options?.client ?? new DefaultPrismaClient();

  if (!options?.client) {
    await prisma.$connect();
  }

  fastify.decorate("prisma", prisma);
  fastify.decorate("withTenant", function withTenant(tenantId, fn, opts) {
    return withTenantTransaction(prisma, tenantId, fn, opts);
  });

  if (!options?.client) {
    fastify.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  }
});
