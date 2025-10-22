import pgBoss from 'pg-boss';
import type { FastifyInstance } from 'fastify';

export type JobQueue = pgBoss;

export const createJobQueue = async (app: FastifyInstance) => {
  const boss = new pgBoss({
    connectionString: process.env.DATABASE_URL,
    newJobCheckIntervalSeconds: 1
  });

  boss.on('error', (error) => {
    app.log.error({ err: error }, 'pg-boss error');
  });

  await boss.start();
  app.log.info('pg-boss started');
  app.addHook('onClose', async () => {
    await boss.stop();
  });

  return boss;
};
