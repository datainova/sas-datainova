import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RoleType } from "@prisma/client";
import type { z } from "zod";

export type McpPlan = "free" | "pro" | "enterprise";

export interface McpContext {
  fastify: FastifyInstance;
  request: FastifyRequest;
  tenantId: string;
  user: {
    id: string;
    role: RoleType;
  };
  plan: McpPlan;
}

export interface McpToolDefinition {
  name: string;
  title: string;
  description?: string;
  inputSchema: z.ZodTypeAny;
  rateLimit?: {
    rpm: number;
  };
  roles?: RoleType[];
  plans?: McpPlan[];
  handler: (ctx: McpContext, input: unknown) => Promise<unknown>;
}

export interface McpResourceDefinition {
  uri: string;
  title: string;
  description?: string;
  mime: string;
  data: () => Promise<unknown> | unknown;
  roles?: RoleType[];
  plans?: McpPlan[];
}

export interface McpPromptDefinition {
  uri: string;
  title: string;
  description?: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  template: string;
  roles?: RoleType[];
  plans?: McpPlan[];
}
