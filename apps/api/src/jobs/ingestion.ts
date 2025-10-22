import type { FastifyInstance } from 'fastify';
import type pgBoss from 'pg-boss';
import { auditEvent } from '../utils/jobAudit';

export const JobNames = {
  INGESTION_REPROCESS: 'ingestion.reprocess',
  ALERT_DISPATCH: 'alerts.dispatch',
  WEBHOOK_RETRY: 'webhook.retry'
} as const;

type IngestionReprocessPayload = {
  indicatorId: string;
  period: string;
  reason: 'backfill' | 'repair';
};

export const registerIngestionJobs = async (app: FastifyInstance, boss: pgBoss) => {
  await boss.createQueue(JobNames.INGESTION_REPROCESS, { retryLimit: 5 });
  await boss.work<JobPayload<typeof JobNames.INGESTION_REPROCESS>>(JobNames.INGESTION_REPROCESS, async (job) => {
    const payload = job.data;
    auditEvent(app, 'processing ingestion reprocess job', { jobId: job.id, payload });
    // TODO: add integration with ingestion service (reload data, recalc status)
  });
};

type JobPayload<T extends string> = T extends typeof JobNames.INGESTION_REPROCESS
  ? IngestionReprocessPayload
  : never;
