import { Prisma, PrismaClient } from "@prisma/client";

export type TenantTransactionClient = Prisma.TransactionClient;

interface TenantTransactionOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
}

export async function withTenantTransaction<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: TenantTransactionClient) => Promise<T>,
  options?: TenantTransactionOptions
): Promise<T> {
  if (!tenantId) {
    throw new Error("tenantId is required to run a tenant-scoped transaction");
  }

  type TransactionOptions = Parameters<typeof prisma.$transaction>[1];

  const txOptions: TransactionOptions = options
    ? {
        ...(options.isolationLevel
          ? { isolationLevel: options.isolationLevel }
          : {}),
        ...(options.maxWait !== undefined ? { maxWait: options.maxWait } : {}),
        ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
      }
    : undefined;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${tenantId}, true)`;
    return fn(tx);
  }, txOptions);
}
