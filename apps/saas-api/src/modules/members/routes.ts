import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma } from "@prisma/client";
import { RoleType } from "@prisma/client";
import { z } from "zod";
import { sendProblem } from "@/http/problem";
import { decodeCursor, encodeCursor } from "@/lib/pagination";

const membersQuerySchema = z.object({
  role: z.nativeEnum(RoleType).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const memberResponseSchema = z.object({
  id: z.string().uuid(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
  }),
  role: z.nativeEnum(RoleType),
  createdAt: z.string(),
});

const membersResponseSchema = z.object({
  items: z.array(memberResponseSchema),
  page: z.object({
    size: z.number(),
    next: z.string().nullable(),
  }),
});

const memberPatchSchema = z.object({
  role: z.nativeEnum(RoleType),
});

export const memberRoutes: FastifyPluginAsync = async (fastify) => {
  const router = fastify.withTypeProvider<ZodTypeProvider>();
    router.get(
    "/members",
    {
      preHandler: fastify.authenticate,
      schema: {
        querystring: membersQuerySchema,
        response: {
          200: membersResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { role, limit, cursor } = request.query;
      const tenantId = request.tenantId!;
      const decodedCursor = decodeCursor(cursor);

      const members = await fastify.withTenant(tenantId, (tx) =>
        tx.organizationMember.findMany({
          where: {
            ...(role ? { role } : {}),
            ...(decodedCursor
              ? {
                  OR: [
                    {
                      createdAt: {
                        lt: new Date(decodedCursor.createdAt),
                      },
                    },
                    {
                      AND: [
                        {
                          createdAt: {
                            equals: new Date(decodedCursor.createdAt),
                          },
                        },
                        {
                          id: {
                            lt: decodedCursor.id,
                          },
                        },
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
          include: {
            user: true,
          },
        })
      );

      let nextCursor: string | null = null;
      if (members.length > limit) {
        const last = members.pop()!;
        nextCursor = encodeCursor({
          id: last.id,
          createdAt: last.createdAt.toISOString(),
        });
      }

      return reply.send({
        items: members.map((member) => ({
          id: member.id,
          user: {
            id: member.userId,
            email: member.user.email,
            name: member.user.name,
          },
          role: member.role,
          createdAt: member.createdAt.toISOString(),
        })),
        page: {
          size: limit,
          next: nextCursor,
        },
      });
    }
  );

  router.patch(
    "/members/:id",
    {
      preHandler: fastify.authenticate,
      schema: {
        body: memberPatchSchema,
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: memberResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { role } = request.body;
      const { id } = request.params;

      let member:
        | Awaited<
            ReturnType<typeof fastify.prisma.organizationMember.update>
          >
        | null = null;

      try {
        member = await fastify.withTenant(tenantId, async (tx) => {
          const current = await tx.organizationMember.findUnique({
            where: { id },
            include: { user: true },
          });

          if (!current) {
            return null;
          }

          if (current.role === RoleType.OWNER && role !== RoleType.OWNER) {
            const owners = await tx.organizationMember.count({
              where: {
                role: RoleType.OWNER,
                id: {
                  not: current.id,
                },
              },
            });

            if (owners === 0) {
              throw new Error("at_least_one_owner_required");
            }
          }

          return tx.organizationMember.update({
            where: { id },
            data: { role },
            include: { user: true },
          });
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "at_least_one_owner_required"
        ) {
          return sendProblem(reply, request, {
            status: 409,
            code: "E_MEMBER_OWNER_REQUIRED",
            detail: "At least one owner must remain in the organization.",
          });
        }
        throw error;
      }

      if (!member) {
        return sendProblem(reply, request, {
          status: 404,
          code: "E_MEMBER_NOT_FOUND",
          detail: "Member not found.",
        });
      }

      const enrichedMember =
        member as Prisma.OrganizationMemberGetPayload<{ include: { user: true } }>;

      return reply.send({
        id: enrichedMember.id,
        user: {
          id: enrichedMember.userId,
          email: enrichedMember.user.email,
          name: enrichedMember.user.name,
        },
        role: enrichedMember.role,
        createdAt: enrichedMember.createdAt.toISOString(),
      });
    }
  );
};
