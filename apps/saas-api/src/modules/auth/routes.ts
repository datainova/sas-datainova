import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import argon2 from "argon2";
import { addDays } from "date-fns";
import { RoleType } from "@prisma/client";

import { env } from "@/config/env";
import { sendProblem } from "@/http/problem";
import { generateTimedToken, generateToken, hashToken } from "@/lib/tokens";
import { organizationNicknameSchema } from "@/modules/organization/schemas";

const signupBodySchema = z.object({
  email: z.string().email(),
});

const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: z.nativeEnum(RoleType),
  }),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string(),
    nickname: z.string().nullable(),
    tz: z.string(),
    currency: z.string(),
    locale: z.string(),
  }),
});

const signupInitiateResponseSchema = z.object({
  ok: z.literal(true),
  verification: z
    .object({
      token: z.string(),
      expiresAt: z.string(),
    })
    .optional(),
});

const loginBodySchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
    organizationId: z
      .string()
      .uuid()
      .optional()
      .describe("UUID da organização (fluxo legado)."),
    organizationNickname: organizationNicknameSchema
      .optional()
      .describe("Apelido amigável da organização."),
  })
  .superRefine((data, ctx) => {
    if (!data.organizationId && !data.organizationNickname) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Informe organizationId ou organizationNickname para concluir o login.",
        path: ["organizationNickname"],
      });
    }
    if (
      data.organizationId &&
      data.organizationNickname &&
      data.organizationNickname.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "organizationNickname não pode ser vazio.",
        path: ["organizationNickname"],
      });
    }
  });

const tokenBodySchema = z.object({
  refreshToken: z.string().min(10),
});

const logoutBodySchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

const signupConfirmQuerySchema = z.object({
  token: z.string().min(10),
});

const signupConfirmResponseSchema = z.object({
  email: z.string().email(),
  expiresAt: z.string(),
});

const signupCompleteBodySchema = z.object({
  token: z.string().min(10),
  name: z.string().min(1).max(120),
  password: z.string().min(8),
  organization: z.object({
    name: z.string().min(1),
    tz: z.string().min(1),
    currency: z.string().min(1),
    locale: z.string().min(2).max(10),
    nickname: organizationNicknameSchema.optional(),
  }),
});

const passwordForgotBodySchema = z.object({
  email: z.string().email(),
});

const passwordForgotResponseSchema = z.object({
  ok: z.boolean(),
  resetToken: z.string().optional(),
  expiresAt: z.string().optional(),
});

const passwordValidateQuerySchema = z.object({
  token: z.string().min(10),
});

const passwordValidateResponseSchema = z.object({
  email: z.string().email(),
  expiresAt: z.string(),
});

const passwordResetBodySchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});

const oidcInitResponseSchema = z.object({
  authorizationUrl: z.string(),
  state: z.string(),
  codeVerifier: z.string(),
});

const oidcCallbackQuerySchema = z.object({
  state: z.string().min(10),
  code: z.string().min(5),
  email: z.string().email(),
  organizationId: z.string().uuid(),
});

const OIDC_STATE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
const REFRESH_TOKEN_LIFETIME_DAYS = 7;
const EMAIL_TOKEN_HOURS = 24;
const PASSWORD_TOKEN_HOURS = 2;

const oidcStateStore = new Map<string, { codeVerifier: string; createdAt: number }>();

async function issueTokens(
  fastify: FastifyInstance,
  payload: { sub: string; email: string; organizationId: string; role: RoleType }
) {
  const accessToken = fastify.jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      role: payload.role,
      type: "access" as const,
    },
    { expiresIn: ACCESS_TOKEN_TTL }
  );

  const refreshToken = fastify.jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      role: payload.role,
      type: "refresh" as const,
    },
    { expiresIn: REFRESH_TOKEN_TTL, key: env.JWT_REFRESH_SECRET }
  );

  const tokenHash = hashToken(refreshToken);
  await fastify.prisma.refreshToken.create({
    data: {
      userId: payload.sub,
      tokenHash,
      expiresAt: addDays(new Date(), REFRESH_TOKEN_LIFETIME_DAYS),
    },
  });

  return { accessToken, refreshToken };
}

async function validateRefreshToken(fastify: FastifyInstance, token: string) {
  const hash = hashToken(token);
  return fastify.prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
  });
}

async function revokeRefreshToken(fastify: FastifyInstance, token: string) {
  const hash = hashToken(token);
  await fastify.prisma.refreshToken.updateMany({
    where: { tokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function getVerificationToken(fastify: FastifyInstance, token: string) {
  const hash = hashToken(token);
  return fastify.prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });
}

async function getPasswordResetToken(fastify: FastifyInstance, token: string) {
  const hash = hashToken(token);
  return fastify.prisma.passwordResetToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();

  router.post(
    "/auth/signup",
    {
      schema: {
        body: signupBodySchema,
        response: {
          202: signupInitiateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      const existingUser = await fastify.prisma.userAccount.findUnique({
        where: { email },
      });

      if (existingUser?.isActive) {
        return sendProblem(reply, request, {
          status: 409,
          code: "E_AUTH_EMAIL_IN_USE",
          detail: "Email address is already registered.",
        });
      }

      let user = existingUser;
      if (!user) {
        user = await fastify.prisma.userAccount.create({
          data: {
            email,
            isActive: false,
          },
        });
      }

      const verification = generateTimedToken(EMAIL_TOKEN_HOURS);
      await fastify.prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: verification.hash,
          expiresAt: verification.expiresAt,
        },
      });

      const originHeader = request.headers.origin;
      const magicLinkBase =
        typeof originHeader === "string" && originHeader.startsWith("http")
          ? originHeader
          : env.MAGIC_LINK_BASE_URL;

      let magicLink: string;
      try {
        const url = new URL("/auth/signup/confirm", magicLinkBase);
        url.searchParams.set("token", verification.token);
        magicLink = url.toString();
      } catch (error) {
        fastify.log.warn({ err: error }, "Failed to build magic link from origin, falling back to base URL.");
        magicLink = `${env.MAGIC_LINK_BASE_URL.replace(/\/$/, "")}/auth/signup/confirm?token=${verification.token}`;
      }

      if (fastify.mailer) {
        try {
          await fastify.mailer.sendMail({
            to: email,
            from: env.SMTP_FROM,
            subject: "Finalize seu cadastro no DataInova Connect",
            text: [
              "Olá!",
              "",
              "Recebemos o seu pedido para acessar o DataInova Connect.",
              "Clique no link abaixo (ou copie e cole no navegador) para concluir o cadastro:",
              magicLink,
              "",
              "Se você não solicitou este acesso, pode ignorar este e-mail.",
            ].join("\n"),
            html: [
              "<p>Olá!</p>",
              "<p>Recebemos o seu pedido para acessar o <strong>DataInova Connect</strong>.</p>",
              `<p><a href="${magicLink}">Clique aqui para concluir o cadastro</a></p>`,
              "<p>Se você não solicitou este acesso, basta ignorar esta mensagem.</p>",
            ].join(""),
          });
        } catch (error) {
          fastify.log.error({ err: error }, "Failed to send signup magic link email.");
        }
      } else {
        fastify.log.warn(
          { email },
          "Mailer unavailable; signup magic link e-mail was not sent."
        );
      }

      return reply.status(202).send({
        ok: true,
        verification: {
          token: verification.token,
          expiresAt: verification.expiresAt.toISOString(),
        },
      });
    }
  );

  router.post(
    "/auth/login",
    {
      schema: {
        body: loginBodySchema,
        response: {
          200: authResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { email, password, organizationId, organizationNickname } = request.body;
      const user = await fastify.prisma.userAccount.findUnique({
        where: { email },
      });

      if (!user || !user.passwordHash) {
        return sendProblem(reply, request, {
          status: 401,
          code: "E_AUTH_INVALID_CREDENTIALS",
          detail: "Invalid credentials.",
        });
      }

      if (!user.isActive) {
        return sendProblem(reply, request, {
          status: 403,
          code: "E_AUTH_USER_INACTIVE",
          detail: "User is inactive.",
        });
      }

      const validPassword = await argon2.verify(user.passwordHash, password);
      if (!validPassword) {
        return sendProblem(reply, request, {
          status: 401,
          code: "E_AUTH_INVALID_CREDENTIALS",
          detail: "Invalid credentials.",
        });
      }

      let targetOrganizationId = organizationId ?? null;
      let organization =
        organizationNickname !== undefined
          ? await fastify.prisma.organization.findUnique({
              where: { nickname: organizationNickname },
            })
          : null;

      if (organizationNickname && !organization) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_AUTH_ORGANIZATION_NOT_FOUND",
          detail: "Organization not found for the provided nickname.",
        });
      }

      if (organization && targetOrganizationId && organization.id !== targetOrganizationId) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_AUTH_ORGANIZATION_MISMATCH",
          detail: "Organization identifier and nickname refer to different records.",
        });
      }

      targetOrganizationId ??= organization?.id ?? null;

      if (!targetOrganizationId) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_AUTH_ORGANIZATION_REQUIRED",
          detail: "Organization identifier is required.",
        });
      }

      if (!organization) {
        organization = await fastify.prisma.organization.findUnique({
          where: { id: targetOrganizationId },
        });
      }

      if (!organization) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_AUTH_ORGANIZATION_NOT_FOUND",
          detail: "Organization not found.",
        });
      }

      const membership = await fastify.withTenant(
        targetOrganizationId,
        (tx) =>
          tx.organizationMember.findFirst({
            where: { userId: user.id },
          })
      );

      if (!membership) {
        return sendProblem(reply, request, {
          status: 403,
          code: "E_AUTH_NOT_MEMBER",
          detail: "User is not a member of this organization.",
        });
      }

      const tokens = await issueTokens(fastify, {
        sub: user.id,
        email: user.email,
        organizationId: organization.id,
        role: membership.role,
      });

      return reply.send({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: membership.role,
        },
        organization: {
          id: targetOrganizationId,
          name: organization.name,
          nickname: organization.nickname,
          tz: organization.tz,
          currency: organization.currency,
          locale: organization.locale,
        },
      });
    }
  );

  router.post(
    "/auth/token",
    {
      schema: {
        body: tokenBodySchema,
        response: {
          200: authResponseSchema.pick({
            accessToken: true,
            refreshToken: true,
          }),
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;
      let payload: any;

      try {
        payload = fastify.jwt.verify(refreshToken, {
          key: env.JWT_REFRESH_SECRET,
        });
      } catch (error) {
        request.log.warn({ err: error }, "refresh token verification failed");
        return sendProblem(reply, request, {
          status: 401,
          code: "E_AUTH_INVALID_REFRESH",
          detail: "Invalid refresh token.",
        });
      }

      if (!payload || payload.type !== "refresh") {
        return sendProblem(reply, request, {
          status: 401,
          code: "E_AUTH_INVALID_REFRESH",
          detail: "Invalid refresh token.",
        });
      }

      const stored = await validateRefreshToken(fastify, refreshToken);
      if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
        return sendProblem(reply, request, {
          status: 401,
          code: "E_AUTH_INVALID_REFRESH",
          detail: "Refresh token expired or revoked.",
        });
      }

      const user = await fastify.prisma.userAccount.findUnique({
        where: { id: payload.sub as string },
      });

      if (!user || !user.isActive) {
        return sendProblem(reply, request, {
          status: 401,
          code: "E_AUTH_USER_INACTIVE",
          detail: "User is inactive.",
        });
      }

      await revokeRefreshToken(fastify, refreshToken);

      const tokens = await issueTokens(fastify, {
        sub: payload.sub,
        email: payload.email,
        organizationId: payload.organizationId,
        role: payload.role,
      });

      return reply.send({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    }
  );

  router.post(
    "/auth/logout",
    {
      preHandler: router.authenticate,
      schema: {
        body: logoutBodySchema.optional(),
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.body?.refreshToken;
      if (refreshToken) {
        await revokeRefreshToken(fastify, refreshToken);
      }
      return reply.send({ ok: true });
    }
  );

  router.get(
    "/auth/signup/confirm",
    {
      schema: {
        querystring: signupConfirmQuerySchema,
        response: {
          200: signupConfirmResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { token } = request.query;
      const record = await getVerificationToken(fastify, token);

      if (!record || record.expiresAt < new Date()) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_VERIFICATION_INVALID",
          detail: "Verification token is invalid or expired.",
        });
      }

      return reply.send({
        email: record.user.email,
        expiresAt: record.expiresAt.toISOString(),
      });
    }
  );

  router.post(
    "/auth/signup/complete",
    {
      schema: {
        body: signupCompleteBodySchema,
        response: {
          200: authResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { token, name, password, organization } = request.body;
      const record = await getVerificationToken(fastify, token);

      if (!record || record.expiresAt < new Date()) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_VERIFICATION_INVALID",
          detail: "Verification token is invalid or expired.",
        });
      }

      if (record.consumedAt) {
        return sendProblem(reply, request, {
          status: 409,
          code: "E_VERIFICATION_CONSUMED",
          detail: "Verification token already used.",
        });
      }

      if (record.user.isActive) {
        return sendProblem(reply, request, {
          status: 409,
          code: "E_VERIFICATION_ALREADY_COMPLETED",
          detail: "Signup already completed for this user.",
        });
      }

      const existingMembership = await fastify.prisma.organizationMember.findFirst({
        where: { userId: record.user.id },
      });

      if (existingMembership) {
        return sendProblem(reply, request, {
          status: 409,
          code: "E_VERIFICATION_ALREADY_COMPLETED",
          detail: "Signup already completed for this user.",
        });
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      const { updatedUser, org, membership } =
        await fastify.prisma.$transaction(async (tx) => {
          await tx.emailVerificationToken.update({
            where: { id: record.id },
            data: { consumedAt: new Date() },
          });

          const org = await tx.organization.create({
            data: {
              name: organization.name,
              nickname: organization.nickname ?? null,
              tz: organization.tz,
              currency: organization.currency,
              locale: organization.locale,
            },
          });

          await tx.$executeRaw`SELECT set_config('app.organization_id', ${org.id}, true)`;

          const membership = await tx.organizationMember.create({
            data: {
              organizationId: org.id,
              userId: record.user.id,
              role: RoleType.OWNER,
            },
          });

          const updatedUser = await tx.userAccount.update({
            where: { id: record.user.id },
            data: {
              name,
              passwordHash,
              isActive: true,
            },
          });

          return { updatedUser, org, membership };
        });

      const tokens = await issueTokens(fastify, {
        sub: updatedUser.id,
        email: updatedUser.email,
        organizationId: org.id,
        role: membership.role,
      });

      return reply.send({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: membership.role,
        },
        organization: {
          id: org.id,
          name: org.name,
          nickname: org.nickname,
          tz: org.tz,
          currency: org.currency,
          locale: org.locale,
        },
      });
    }
  );

  router.post(
    "/auth/password/forgot",
    {
      schema: {
        body: passwordForgotBodySchema,
        response: {
          202: passwordForgotResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      const user = await fastify.prisma.userAccount.findUnique({
        where: { email },
      });

      if (!user) {
        return reply.status(202).send({ ok: true });
      }

      const reset = generateTimedToken(PASSWORD_TOKEN_HOURS);
      await fastify.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: reset.hash,
          expiresAt: reset.expiresAt,
        },
      });

      return reply.status(202).send({
        ok: true,
        resetToken: reset.token,
        expiresAt: reset.expiresAt.toISOString(),
      });
    }
  );

  router.get(
    "/auth/password/validate",
    {
      schema: {
        querystring: passwordValidateQuerySchema,
        response: {
          200: passwordValidateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { token } = request.query;
      const record = await getPasswordResetToken(fastify, token);

      if (!record || record.expiresAt < new Date() || record.consumedAt) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_PASSWORD_TOKEN_INVALID",
          detail: "Password reset token is invalid or expired.",
        });
      }

      return reply.send({
        email: record.user.email,
        expiresAt: record.expiresAt.toISOString(),
      });
    }
  );

  router.post(
    "/auth/password/reset",
    {
      schema: {
        body: passwordResetBodySchema,
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (request, reply) => {
      const { token, password } = request.body;
      const record = await getPasswordResetToken(fastify, token);

      if (!record || record.expiresAt < new Date() || record.consumedAt) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_PASSWORD_TOKEN_INVALID",
          detail: "Password reset token is invalid or expired.",
        });
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      await fastify.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.update({
          where: { id: record.id },
          data: { consumedAt: new Date() },
        });

        await tx.userAccount.update({
          where: { id: record.user.id },
          data: { passwordHash, isActive: true },
        });
      });

      return reply.send({ ok: true });
    }
  );

  router.get(
    "/auth/oidc/google/init",
    {
      schema: {
        response: {
          200: oidcInitResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const state = generateToken(16);
      const codeVerifier = generateToken(32);
      oidcStateStore.set(state, { codeVerifier, createdAt: Date.now() });

      const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=placeholder&redirect_uri=placeholder&scope=openid%20email&state=${state}`;

      return reply.send({ authorizationUrl, state, codeVerifier });
    }
  );

  router.get(
    "/auth/oidc/google/callback",
    {
      schema: {
        querystring: oidcCallbackQuerySchema,
        response: {
          200: authResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { state, email, organizationId } = request.query;
      const entry = oidcStateStore.get(state);
      if (!entry || Date.now() - entry.createdAt > OIDC_STATE_TTL_MS) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_OIDC_STATE_INVALID",
          detail: "OIDC state is invalid or expired.",
        });
      }
      oidcStateStore.delete(state);

      const user = await fastify.prisma.userAccount.findUnique({
        where: { email },
      });

      if (!user) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_AUTH_USER_NOT_FOUND",
          detail: "User not found for OIDC callback.",
        });
      }

      const { membership, organization } = await fastify.withTenant(
        organizationId,
        async (tx) => {
          const membership = await tx.organizationMember.findFirst({
            where: { userId: user.id },
          });
          const organization = await tx.organization.findUnique({
            where: { id: organizationId },
          });
          return { membership, organization };
        }
      );

      if (!membership || !organization) {
        return sendProblem(reply, request, {
          status: 403,
          code: "E_AUTH_NOT_MEMBER",
          detail: "User is not a member of the requested organization.",
        });
      }

      const tokens = await issueTokens(fastify, {
        sub: user.id,
        email: user.email,
        organizationId: organization.id,
        role: membership.role,
      });

      return reply.send({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: membership.role,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          nickname: organization.nickname,
          tz: organization.tz,
          currency: organization.currency,
          locale: organization.locale,
        },
      });
    }
  );
};
