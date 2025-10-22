import type { FastifyInstance } from 'fastify';
import type { JobQueue } from '../plugins/jobQueue';
import { registerIngestionJobs } from './ingestion';
import { registerAuthJobs } from './auth';

export const registerJobs = async (app: FastifyInstance, boss: JobQueue) => {
  await registerAuthJobs(app, boss);
  await registerIngestionJobs(app, boss);
  // Additional jobs (alerts, connectors, webhooks) can be registered here.
};
