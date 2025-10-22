import type { PrismaClient } from '@prisma/client';
import type { TenantContext } from '../app';

type AuditParams = {
  tx: PrismaClient;
  ctx: TenantContext;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
};

export const recordAudit = async ({ tx, ctx, entity, entityId, action, before, after }: AuditParams) => {
  await tx.auditLog.create({
    data: {
      orgId: ctx.orgId,
      entity,
      entityId,
      action,
      before: before ? (before as Record<string, unknown>) : null,
      after: after ? (after as Record<string, unknown>) : null,
      actorId: ctx.userId ?? null
    }
  });
};
