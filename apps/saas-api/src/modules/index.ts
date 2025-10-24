import type { FastifyInstance } from "fastify";
import { authRoutes } from "@/modules/auth/routes";
import { organizationRoutes } from "@/modules/organization/routes";
import { memberRoutes } from "@/modules/members/routes";
import { objectiveRoutes } from "@/modules/objectives/routes";
import { indicatorRoutes } from "@/modules/indicators/routes";
import { ingestRoutes } from "@/modules/ingest/routes";
import { alertRoutes } from "@/modules/alerts/routes";
import { checkinRoutes } from "@/modules/checkins/routes";
import { agentRoutes } from "@/modules/agents/routes";
import { webhookRoutes } from "@/modules/webhooks/routes";
import { observabilityRoutes } from "@/modules/observability/routes";
import { onboardingRoutes } from "@/modules/onboarding/routes";
import { inviteRoutes } from "@/modules/invites/routes";
import { mcpRoutes } from "@/modules/mcp/routes";

export const registerModules = async (
  app: FastifyInstance<any, any, any, any, any>
) => {
  await app.register(authRoutes, { prefix: "/v1" });
  await app.register(organizationRoutes, { prefix: "/v1" });
  await app.register(memberRoutes, { prefix: "/v1" });
  await app.register(inviteRoutes, { prefix: "/v1" });
  await app.register(objectiveRoutes, { prefix: "/v1" });
  await app.register(indicatorRoutes, { prefix: "/v1" });
  await app.register(ingestRoutes, { prefix: "/v1" });
  await app.register(alertRoutes, { prefix: "/v1" });
  await app.register(checkinRoutes, { prefix: "/v1" });
  await app.register(agentRoutes, { prefix: "/v1" });
  await app.register(onboardingRoutes, { prefix: "/v1" });
  await app.register(webhookRoutes, { prefix: "/v1" });
  await app.register(observabilityRoutes, { prefix: "/v1" });
  await app.register(mcpRoutes, { prefix: "/v1" });
};
