import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { sendProblem } from "@/http/problem";
import { organizationNicknameSchema } from "@/modules/organization/schemas";

const organizationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  nickname: z.string().nullable(),
  tz: z.string(),
  currency: z.string(),
  locale: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const organizationPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tz: z.string().min(1).optional(),
  currency: z.string().min(1).optional(),
  locale: z.string().min(2).max(10).optional(),
  nickname: z
    .union([organizationNicknameSchema, z.literal(null)])
    .optional()
    .describe("Atualiza ou remove o apelido amigável da organização."),
});

export const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();
    router.get(
    "/organization",
    {
      preHandler: fastify.authenticate,
      schema: {
        response: {
          200: organizationResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;

      const organization = await fastify.withTenant(tenantId, (tx) =>
        tx.organization.findUnique({ where: { id: tenantId } })
      );

      if (!organization) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_ORGANIZATION_NOT_FOUND",
          detail: "Organization not found.",
        });
      }

      return reply.send({
        id: organization.id,
        name: organization.name,
        nickname: organization.nickname,
        tz: organization.tz,
        currency: organization.currency,
        locale: organization.locale,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
      });
    }
  );

  router.patch(
    "/organization",
    {
      preHandler: fastify.authenticate,
      schema: {
        body: organizationPatchSchema,
        response: {
          200: organizationResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const data = request.body;

      if (!Object.keys(data).length) {
        return sendProblem(reply, request, {
          status: 400,
          code: "E_ORGANIZATION_NO_CHANGES",
          detail: "No changes provided.",
        });
      }

      const updateData: Prisma.OrganizationUpdateInput = {};

      if (data.name !== undefined) {
        updateData.name = data.name;
      }
      if (data.tz !== undefined) {
        updateData.tz = data.tz;
      }
      if (data.currency !== undefined) {
        updateData.currency = data.currency;
      }
      if (data.locale !== undefined) {
        updateData.locale = data.locale;
      }
      if (data.nickname !== undefined) {
        updateData.nickname = data.nickname;
      }

      const organization = await fastify.withTenant(tenantId, (tx) =>
        tx.organization.update({
          where: { id: tenantId },
          data: updateData,
        })
      );

      return reply.send({
        id: organization.id,
        name: organization.name,
        nickname: organization.nickname,
        tz: organization.tz,
        currency: organization.currency,
        locale: organization.locale,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
      });
    }
  );
};
