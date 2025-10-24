import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { RoleType } from "@prisma/client";
import { env } from "@/config/env";
import { sendProblem } from "@/http/problem";

interface AuthTokenPayload {
  sub: string;
  email: string;
  organizationId: string;
  role: RoleType;
  type?: "access" | "refresh";
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: AuthTokenPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

export const authPlugin = fp(async (fastify) => {
  await fastify.register(jwt as any, {
    secret: env.JWT_SECRET,
    sign: {
      issuer: "datainova-connect",
      audience: "saas",
    },
    verify: {
      issuer: "datainova-connect",
      audience: "saas",
    },
  });

  fastify.decorate(
    "authenticate",
    async function authenticate(request: FastifyRequest, reply: FastifyReply) {
      try {
        const payload = await request.jwtVerify<AuthTokenPayload>();
        if (payload.type && payload.type !== "access") {
          return sendProblem(reply, request, {
            status: 401,
            code: "E_AUTH_INVALID_TOKEN",
            detail: "Access token required.",
          });
        }

        request.authUser = {
          id: payload.sub,
          email: payload.email,
          organizationId: payload.organizationId,
          role: payload.role,
        };
        request.tenantId = payload.organizationId;
      } catch (error) {
        request.log.warn({ err: error }, "jwt verification failed");
        return sendProblem(reply, request, {
          status: 401,
          code: "E_AUTH_UNAUTHORIZED",
          detail: "Authentication required.",
        });
      }
    }
  );
});
