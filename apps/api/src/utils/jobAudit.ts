import type { FastifyInstance } from 'fastify';

export const auditEvent = (app: FastifyInstance, message: string, extra?: Record<string, unknown>) => {
  app.log.info({ source: 'jobs', ...extra }, message);
};
