import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export const registerHealthRoutes = (app: FastifyInstance) => {
  app.get(
    '/healthz',
    {
      schema: {
        response: {
          200: z.object({
            status: z.string(),
            uptime: z.number()
          })
        }
      }
    },
    async () => ({
      status: 'ok',
      uptime: process.uptime()
    })
  );
};
