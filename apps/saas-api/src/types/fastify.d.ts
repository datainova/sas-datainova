import "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Prisma, PrismaClient, RoleType } from "@prisma/client";
import type { Transporter } from "nodemailer";
import type { TenantTransactionClient } from "@/lib/tenant";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    withTenant<T = any>(
      tenantId: string,
      fn: (tx: TenantTransactionClient) => Promise<T>,
      options?: {
        isolationLevel?: Prisma.TransactionIsolationLevel;
        maxWait?: number;
        timeout?: number;
      }
    ): Promise<T>;
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    mailer: Transporter | null;
  }

  interface FastifyRequest {
    rawBody?: string;
    tenantId?: string;
    authUser?: {
      id: string;
      email: string;
      organizationId: string;
      role: RoleType;
    };
  }
}
