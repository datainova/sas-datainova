import type { FastifyInstance } from "fastify";
import type { BillingPlan } from "@prisma/client";
import { McpError } from "./errors";
import type { McpPlan } from "./types";

export const mapBillingPlanToMcpPlan = (plan: BillingPlan): McpPlan => {
  switch (plan) {
    case "FREE":
      return "free";
    case "PRO":
      return "pro";
    case "ENTERPRISE":
      return "enterprise";
    default:
      return "free";
  }
};

export const resolveMcpPlan = async (
  fastify: FastifyInstance,
  tenantId: string
): Promise<McpPlan> => {
  const organization = await fastify.withTenant(tenantId, (tx) =>
    tx.organization.findUnique({
      where: { id: tenantId },
      select: { billingPlan: true },
    })
  );

  if (!organization) {
    throw new McpError(404, "E_TENANT_NOT_FOUND", "Organization not found.");
  }

  return mapBillingPlanToMcpPlan(organization.billingPlan);
};
