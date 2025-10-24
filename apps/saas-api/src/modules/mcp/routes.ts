import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "@/config/env";
import { sendProblem } from "@/http/problem";
import {
  filterAccessible,
  mcpPrompts,
  mcpResources,
  mcpTools,
  planCaps,
} from "./registry";
import type {
  McpContext,
  McpPlan,
  McpPromptDefinition,
  McpResourceDefinition,
  McpToolDefinition,
} from "./types";
import { McpError } from "./errors";
import { resolveMcpPlan } from "./plan";

type JsonRpcId = string | number | null | undefined;

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

const jsonRpcEnvelopeSchema = z.union([
  jsonRpcRequestSchema,
  z.array(jsonRpcRequestSchema),
]);

const jsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number(), z.null()]).optional(),
    result: z.unknown().optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        data: z.unknown().optional(),
      })
      .optional(),
  })
  .refine(
    (payload) =>
      Object.prototype.hasOwnProperty.call(payload, "result") ||
      Object.prototype.hasOwnProperty.call(payload, "error"),
    {
      message: "result or error must be present",
    }
  )
  .describe("JSON-RPC 2.0 response");

const jsonRpcResponseEnvelopeSchema = z
  .union([jsonRpcResponseSchema, z.array(jsonRpcResponseSchema)])
  .describe("JSON-RPC 2.0 response envelope (single or batch).");

const mcpCapabilitiesSchema = z
  .object({
    version: z.string(),
    plan: z.enum(["free", "pro", "enterprise"]),
    transports: z.object({
      http: z.boolean(),
      sse: z.boolean(),
      websocket: z.boolean(),
    }),
    rateLimit: z.object({
      rpm: z.number().int(),
    }),
    tools: z
      .array(
        z.object({
          name: z.string(),
          title: z.string(),
        })
      )
      .default([]),
    resources: z
      .array(
        z.object({
          uri: z.string(),
          title: z.string(),
        })
      )
      .default([]),
    prompts: z
      .array(
        z.object({
          uri: z.string(),
          title: z.string(),
        })
      )
      .default([]),
  })
  .describe("Capabilities habilitadas para o tenant/MCP.");

const toolsCallParamsSchema = z
  .object({
    name: z.string(),
    arguments: z.unknown().optional(),
  })
  .default({ arguments: {} });

const resourcesReadParamsSchema = z.object({
  uri: z.string(),
});

const promptsPerformParamsSchema = z.object({
  uri: z.string(),
  input: z.unknown().optional(),
});

const renderTemplate = (template: string, input: Record<string, unknown>) =>
  template.replace(/\{\{(.*?)\}\}/g, (_, token: string) => {
    const key = token.trim();
    const value = input[key];

    if (value === undefined || value === null) {
      return "";
    }

    if (Array.isArray(value)) {
      return value.map((item) => renderValue(item)).join(", ");
    }

    return renderValue(value);
  });

const renderValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

const toJsonSchema = (schema: z.ZodTypeAny) =>
  zodToJsonSchema(schema, { target: "jsonSchema7" });

const toRpcError = (
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: {
    code,
    message,
    data,
  },
});

const handleToolError = (id: JsonRpcId, error: unknown): JsonRpcResponse => {
  if (error instanceof McpError) {
    return toRpcError(id, error.statusCode, error.message, {
      code: error.code,
      context: error.data ?? null,
    });
  }

  return toRpcError(id, 500, "Unexpected error.");
};

const createExecutor =
  (
    context: McpContext,
    catalogue: {
      tools: McpToolDefinition[];
      resources: McpResourceDefinition[];
      prompts: McpPromptDefinition[];
    },
    request: FastifyRequest
  ) =>
  async (
    rpcRequest: z.infer<typeof jsonRpcRequestSchema>
  ): Promise<JsonRpcResponse | null> => {
    const id = rpcRequest.id ?? null;
    const startedAt = Date.now();

    try {
      switch (rpcRequest.method) {
        case "tools/list": {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              tools: catalogue.tools.map((tool) => ({
                name: tool.name,
                title: tool.title,
                description: tool.description ?? null,
                rateLimit: tool.rateLimit ?? null,
                inputSchema: toJsonSchema(tool.inputSchema),
              })),
            },
          };
        }

        case "tools/call": {
          const params = toolsCallParamsSchema.parse(rpcRequest.params ?? {});
          const tool = catalogue.tools.find(
            (candidate) => candidate.name === params.name
          );

          if (!tool) {
            return toRpcError(id, 403, "Tool not available for this caller.", {
              code: "E_TOOL_FORBIDDEN",
            });
          }

          try {
            const result = await tool.handler(context, params.arguments ?? {});
            return { jsonrpc: "2.0", id, result };
          } catch (error) {
            request.log.warn({ err: error, tool: tool.name }, "mcp tool error");
            return handleToolError(id, error);
          }
        }

        case "resources/list": {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              resources: catalogue.resources.map((resource) => ({
                uri: resource.uri,
                title: resource.title,
                description: resource.description ?? null,
                mime: resource.mime,
              })),
            },
          };
        }

        case "resources/read": {
          const params = resourcesReadParamsSchema.parse(
            rpcRequest.params ?? {}
          );
          const resource = catalogue.resources.find(
            (candidate) => candidate.uri === params.uri
          );

          if (!resource) {
            return toRpcError(id, 404, "Resource not found.", {
              code: "E_RESOURCE_NOT_FOUND",
              uri: params.uri,
            });
          }

          const data = await resource.data();

          return {
            jsonrpc: "2.0",
            id,
            result: {
              uri: resource.uri,
              mime: resource.mime,
              data,
            },
          };
        }

        case "prompts/list": {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              prompts: catalogue.prompts.map((prompt) => ({
                uri: prompt.uri,
                title: prompt.title,
                description: prompt.description ?? null,
                inputSchema: toJsonSchema(prompt.inputSchema),
              })),
            },
          };
        }

        case "prompts/perform": {
          const params = promptsPerformParamsSchema.parse(
            rpcRequest.params ?? {}
          );
          const prompt = catalogue.prompts.find(
            (candidate) => candidate.uri === params.uri
          );

          if (!prompt) {
            return toRpcError(id, 404, "Prompt not found.", {
              code: "E_PROMPT_NOT_FOUND",
              uri: params.uri,
            });
          }

          const input = prompt.inputSchema.parse(params.input ?? {}) as Record<
            string,
            unknown
          >;

          const rendered = renderTemplate(prompt.template, input);

          return {
            jsonrpc: "2.0",
            id,
            result: {
              output: rendered,
            },
          };
        }

        default:
          return toRpcError(id, -32601, "Method not found.", {
            code: "E_METHOD_NOT_FOUND",
            method: rpcRequest.method,
          });
      }
    } finally {
      const duration = Date.now() - startedAt;
      request.log.debug(
        {
          component: "saas-api:mcp",
          rpcMethod: rpcRequest.method,
          rpcId: id,
          duration_ms: duration,
        },
        "mcp rpc handled"
      );
    }
  };

const ensureMcpEnabled = async (
  enabled: boolean,
  reply: FastifyReply,
  request: FastifyRequest
) => {
  if (!enabled) {
    return sendProblem(reply, request, {
      status: 404,
      code: "E_MCP_DISABLED",
      detail: "The MCP endpoints are disabled.",
    });
  }
  return null;
};

export const mcpRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();

  router.post(
    "/mcp",
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ["mcp"],
        summary: "Executar chamadas MCP",
        description:
          "Executa uma ou mais chamadas do Model Context Protocol usando JSON-RPC 2.0.",
        body: jsonRpcEnvelopeSchema,
        response: {
          200: jsonRpcResponseEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const disabledResponse = await ensureMcpEnabled(
        env.MCP_ENABLED,
        reply,
        request
      );
      if (disabledResponse) {
        return disabledResponse;
      }

      if (!request.tenantId || !request.authUser) {
        return sendProblem(reply, request, {
          status: 401,
          code: "E_AUTH_UNAUTHORIZED",
          detail: "Authentication required.",
        });
      }

      let plan: McpPlan;
      try {
        plan = await resolveMcpPlan(fastify, request.tenantId);
      } catch (error) {
        if (error instanceof McpError) {
          return sendProblem(reply, request, {
            status: error.statusCode,
            code: error.code,
            detail: error.message,
          });
        }
        throw error;
      }

      const context: McpContext = {
        fastify,
        request,
        tenantId: request.tenantId,
        user: {
          id: request.authUser.id,
          role: request.authUser.role,
        },
        plan,
      };

      const payload = jsonRpcEnvelopeSchema.parse(request.body);
      const catalogue = {
        tools: filterAccessible(mcpTools, context),
        resources: filterAccessible(mcpResources, context),
        prompts: filterAccessible(mcpPrompts, context),
      };

      const executeSingle = createExecutor(context, catalogue, request);

      if (Array.isArray(payload)) {
        const responses: JsonRpcResponse[] = [];
        for (const entry of payload) {
          const response = await executeSingle(entry);
          if (response) {
            responses.push(response);
          }
        }
        return reply.send(responses);
      }

      const single = await executeSingle(payload);
      if (!single) {
        return reply.status(204).send();
      }

      return reply.send(single);
    }
  );

  router.post(
    "/mcp/stream",
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ["mcp"],
        summary: "Stream MCP (SSE)",
        description:
          "Executa chamadas MCP via Server-Sent Events, emitindo eventos `result`, `error` e `complete`.",
        body: jsonRpcEnvelopeSchema,
        response: {
          200: z
            .string()
            .describe(
              "Fluxo text/event-stream com envelopes JSON-RPC serializados."
            ),
        },
      },
    },
    async (request, reply) => {
      const disabledResponse = await ensureMcpEnabled(
        env.MCP_ENABLED && env.MCP_SSE_ENABLED,
        reply,
        request
      );
      if (disabledResponse) {
        return disabledResponse;
      }

      if (!request.tenantId || !request.authUser) {
        return sendProblem(reply, request, {
          status: 401,
          code: "E_AUTH_UNAUTHORIZED",
          detail: "Authentication required.",
        });
      }

      let plan: McpPlan;
      try {
        plan = await resolveMcpPlan(fastify, request.tenantId);
      } catch (error) {
        if (error instanceof McpError) {
          return sendProblem(reply, request, {
            status: error.statusCode,
            code: error.code,
            detail: error.message,
          });
        }
        throw error;
      }

      const profile = planCaps[plan];
      if (!profile.sse) {
        return sendProblem(reply, request, {
          status: 403,
          code: "E_PLAN_FORBIDDEN",
          detail: "Current plan does not include MCP streaming.",
        });
      }

      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.hijack();
      reply.raw.writeHead(200);

      const context: McpContext = {
        fastify,
        request,
        tenantId: request.tenantId,
        user: {
          id: request.authUser.id,
          role: request.authUser.role,
        },
        plan,
      };

      const payload = jsonRpcEnvelopeSchema.parse(request.body);
      const catalogue = {
        tools: filterAccessible(mcpTools, context),
        resources: filterAccessible(mcpResources, context),
        prompts: filterAccessible(mcpPrompts, context),
      };

      const sendEvent = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const heartbeat = setInterval(() => {
        reply.raw.write(`: ping\n\n`);
      }, 15000);

      const closeStream = () => {
        clearInterval(heartbeat);
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      };

      reply.raw.on("close", closeStream);
      reply.raw.on("error", closeStream);

      try {
        const executeSingle = createExecutor(context, catalogue, request);

        const processEntry = async (
          entry: z.infer<typeof jsonRpcRequestSchema>
        ) => {
          const response = await executeSingle(entry);
          if (response) {
            sendEvent("result", response);
          }
        };

        if (Array.isArray(payload)) {
          for (const entry of payload) {
            await processEntry(entry);
          }
        } else {
          await processEntry(payload);
        }

        sendEvent("complete", { ok: true });
      } catch (error) {
        sendEvent("error", {
          message: error instanceof Error ? error.message : "Unexpected error.",
        });
      } finally {
        closeStream();
      }
    }
  );

  router.get(
    "/mcp/capabilities",
    {
      preHandler: fastify.authenticate,
      schema: {
        tags: ["mcp"],
        summary: "Consultar capacidades MCP",
        description:
          "Retorna os recursos MCP habilitados para o tenant atual considerando plano e papel.",
        response: {
          200: mcpCapabilitiesSchema,
        },
      },
    },
    async (request, reply) => {
      const disabledResponse = await ensureMcpEnabled(
        env.MCP_ENABLED,
        reply,
        request
      );
      if (disabledResponse) {
        return disabledResponse;
      }

      if (!request.tenantId || !request.authUser) {
        return sendProblem(reply, request, {
          status: 401,
          code: "E_AUTH_UNAUTHORIZED",
          detail: "Authentication required.",
        });
      }

      let plan: McpPlan;
      try {
        plan = await resolveMcpPlan(fastify, request.tenantId);
      } catch (error) {
        if (error instanceof McpError) {
          return sendProblem(reply, request, {
            status: error.statusCode,
            code: error.code,
            detail: error.message,
          });
        }
        throw error;
      }

      const profile = planCaps[plan];

      const context: McpContext = {
        fastify,
        request,
        tenantId: request.tenantId,
        user: {
          id: request.authUser.id,
          role: request.authUser.role,
        },
        plan,
      };

      const accessibleTools = filterAccessible(mcpTools, context);
      const accessibleResources = filterAccessible(mcpResources, context);
      const accessiblePrompts = filterAccessible(mcpPrompts, context);

      return reply.send({
        version: "1.0",
        plan,
        transports: {
          http: true,
          sse: env.MCP_SSE_ENABLED && profile.sse,
          websocket: env.MCP_WS_ENABLED && profile.websocket,
        },
        rateLimit: {
          rpm: profile.rpm,
        },
        tools: accessibleTools.map((tool) => ({
          name: tool.name,
          title: tool.title,
        })),
        resources: accessibleResources.map((resource) => ({
          uri: resource.uri,
          title: resource.title,
        })),
        prompts: accessiblePrompts.map((prompt) => ({
          uri: prompt.uri,
          title: prompt.title,
        })),
      });
    }
  );
};
