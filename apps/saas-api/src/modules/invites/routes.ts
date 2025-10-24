import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { addDays } from "date-fns";
import { z } from "zod";
import { RoleType } from "@prisma/client";

import { sendProblem } from "@/http/problem";
import { decodeCursor, encodeCursor } from "@/lib/pagination";
import { generateToken } from "@/lib/tokens";

const listInvitesQuerySchema = z.object({
  updatedSince: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const inviteItemSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.nativeEnum(RoleType),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  createdAt: z.string(),
});

const listInvitesResponseSchema = z.object({
  items: z.array(inviteItemSchema),
  page: z.object({
    size: z.number(),
    next: z.string().nullable(),
  }),
});

const createInviteBodySchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(RoleType).default(RoleType.VIEWER),
});

const createInviteResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.nativeEnum(RoleType),
  token: z.string(),
  expiresAt: z.string(),
});

const resendInviteResponseSchema = z.object({
  id: z.string().uuid(),
  token: z.string(),
  expiresAt: z.string(),
});

const INVITE_EXPIRATION_DAYS = 7;

export const inviteRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();

  router.get(
    "/invites",
    {
      preHandler: router.authenticate,
      schema: {
        querystring: listInvitesQuerySchema,
        response: {
          200: listInvitesResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { updatedSince, limit, cursor } = request.query;
      const tenantId = request.authUser!.organizationId;
      const decodedCursor = decodeCursor(cursor);

      const invites = await fastify.withTenant(tenantId, (tx) =>
        tx.invite.findMany({
          where: {
            ...(updatedSince
              ? { createdAt: { gte: new Date(updatedSince) } }
              : {}),
            ...(decodedCursor
              ? {
                  OR: [
                    { createdAt: { lt: new Date(decodedCursor.createdAt) } },
                    {
                      AND: [
                        { createdAt: { equals: new Date(decodedCursor.createdAt) } },
                        { id: { lt: decodedCursor.id } },
                      ],
                    },
                  ],
                }
              : {}),
          },
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
          take: limit + 1,
        })
      );

      let nextCursor: string | null = null;
      if (invites.length > limit) {
        const last = invites.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.createdAt.toISOString(),
        });
      }

      return reply.send({
        items: invites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt.toISOString(),
          acceptedAt: invite.acceptedAt
            ? invite.acceptedAt.toISOString()
            : null,
          createdAt: invite.createdAt.toISOString(),
        })),
        page: {
          size: limit,
          next: nextCursor,
        },
      });
    }
  );

  router.post(
    "/invites",
    {
      preHandler: router.authenticate,
      schema: {
        body: createInviteBodySchema,
        response: {
          201: createInviteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.authUser!.organizationId;
      const { email, role } = request.body;

      const token = generateToken(24);
      const expiresAt = addDays(new Date(), INVITE_EXPIRATION_DAYS);

      const invite = await fastify.withTenant(tenantId, (tx) =>
        tx.invite.create({
          data: {
            organizationId: tenantId,
            email,
            role,
            token,
            expiresAt,
          },
        })
      );

      return reply.status(201).send({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        token: invite.token,
        expiresAt: invite.expiresAt.toISOString(),
      });
    }
  );

  router.post(
    "/invites/:id/resend",
    {
      preHandler: router.authenticate,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: resendInviteResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.authUser!.organizationId;
      const { id } = request.params;

      const invite = await fastify.withTenant(tenantId, (tx) =>
        tx.invite.findUnique({ where: { id } })
      );

      if (!invite) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_INVITE_NOT_FOUND",
          detail: "Invite not found.",
        });
      }

      const token = generateToken(24);
      const expiresAt = addDays(new Date(), INVITE_EXPIRATION_DAYS);

      await fastify.withTenant(tenantId, (tx) =>
        tx.invite.update({
          where: { id },
          data: {
            token,
            expiresAt,
          },
        })
      );

      return reply.send({
        id,
        token,
        expiresAt: expiresAt.toISOString(),
      });
    }
  );
};
