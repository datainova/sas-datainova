import { randomUUID } from "crypto";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { RateLimitPluginOptions } from "@fastify/rate-limit";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { PrismaClient } from "@prisma/client";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { env, allowedCorsOrigins } from "@/config/env";
import { logger } from "@/logger";
import { prismaPlugin } from "@/plugins/prisma";
import { authPlugin } from "@/plugins/auth";
import { mailerPlugin } from "@/plugins/mailer";
import { sendProblem } from "@/http/problem";
import { registerModules } from "@/modules";

export interface BuildAppOptions {
  prisma?: PrismaClient;
}

export const buildApp = async (options?: BuildAppOptions) => {
  const app = Fastify({
    logger,
    disableRequestLogging: true,
    genReqId(request) {
      const forwarded = request.headers["x-request-id"];
      if (typeof forwarded === "string" && forwarded.length > 0) {
        return forwarded;
      }
      if (Array.isArray(forwarded) && forwarded.length > 0) {
        return forwarded[0]!;
      }
      return randomUUID();
    },
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const defaultJsonParser = app.getDefaultJsonParser("ignore", "ignore");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      const raw = body as string;
      request.rawBody = raw;
      defaultJsonParser(request, raw, done);
    }
  );

  app.addHook("onRequest", (request, reply, done) => {
    reply.header("x-request-id", request.id);
    const incomingTraceparent = request.headers["traceparent"];
    const traceparentCandidate = Array.isArray(incomingTraceparent)
      ? incomingTraceparent[0]
      : incomingTraceparent;

    if (typeof traceparentCandidate === "string" && traceparentCandidate) {
      reply.header("traceparent", traceparentCandidate);
      request.headers["traceparent"] = traceparentCandidate;
    } else {
      const traceId = randomUUID().replace(/-/g, "");
      const spanId = traceId.substring(0, 16);
      const newTraceparent = `00-${traceId}-${spanId}-01`;
      request.headers["traceparent"] = newTraceparent;
      reply.header("traceparent", newTraceparent);
    }

    done();
  });

  await app.register(helmet, { global: true });
  await app.register(cookie, {
    hook: "onRequest",
  });

  await app.register(cors, {
    origin: allowedCorsOrigins.length ? allowedCorsOrigins : true,
    credentials: true,
  });

  const rateLimitOptions: RateLimitPluginOptions = {
    max: 1000,
    timeWindow: "1 minute",
    allowList: [],
    keyGenerator: (request) => {
      const forwarded = request.headers["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded.length > 0) {
        return forwarded;
      }
      if (Array.isArray(forwarded) && forwarded.length > 0) {
        return forwarded[0]!;
      }
      if (request.ip) {
        return request.ip;
      }
      if (request.socket?.remoteAddress) {
        return request.socket.remoteAddress;
      }
      return "unknown";
    },
  };

  await app.register(rateLimit, rateLimitOptions);

  await app.register(swagger, {
    mode: "dynamic",
    openapi: {
      info: {
        title: "DataInova Connect — SaaS API",
        description:
          "Documentação pública dos endpoints REST do DataInova Connect (SaaS).",
        version: "1.0.0",
      },
      servers: [
        {
          url: "http://localhost:3333/v1",
          description: "Ambiente local",
        },
      ],
      tags: [
        { name: "auth", description: "Autenticação e controle de sessão" },
        { name: "onboarding", description: "Fluxos de onboarding" },
        { name: "organization", description: "Dados da organização e membros" },
        { name: "invites", description: "Gestão de convites" },
        { name: "objectives", description: "Objetivos e indicadores" },
        { name: "ingest", description: "Ingestão de valores" },
        { name: "alerts", description: "Alertas e acknowledgment" },
        { name: "checkins", description: "Check-ins" },
        { name: "agents", description: "Gestão de agentes" },
        { name: "webhooks", description: "Integrações por webhook" },
        { name: "observability", description: "Saúde e métricas" },
        { name: "mcp", description: "Model Context Protocol" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
    staticCSP: true,
    transformSpecification: (swaggerObject) => swaggerObject,
  });

  if (options?.prisma) {
    await app.register(prismaPlugin, { client: options.prisma });
  } else {
    await app.register(prismaPlugin);
  }
  await app.register(mailerPlugin);
  await app.register(authPlugin);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request error");

    if ("statusCode" in error && typeof error.statusCode === "number") {
      return sendProblem(reply, request, {
        status: error.statusCode,
        code: "E_HTTP_ERROR",
        detail: error.message,
      });
    }

    if ((error as any).validation) {
      return sendProblem(reply, request, {
        status: 400,
        code: "E_VALIDATION",
        detail: "Validation failed.",
        context: { issues: (error as any).validation },
      });
    }

    return sendProblem(reply, request, {
      status: 500,
      code: "E_INTERNAL",
      detail: "Unexpected error.",
    });
  });

  await registerModules(app);

  return app;
};
