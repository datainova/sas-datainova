import closeWithGrace from 'close-with-grace';
import { loadEnv } from '@datainova/config';
import { ensureCoreRecords } from '@datainova/database';
import { buildApp } from './app';
import { createJobQueue } from './plugins/jobQueue';
import { registerJobs } from './jobs';

const env = loadEnv(process.env);

const app = buildApp(env);

const start = async () => {
  try {
    await ensureCoreRecords();
    const boss = await createJobQueue(app);
    app.decorate('jobQueue', boss);
    await registerJobs(app, boss);
    await app.listen({ host: '0.0.0.0', port: env.PORT });
    app.log.info(`API listening on port ${env.PORT}`);
  } catch (error) {
    app.log.error(error, 'Failed to start server');
    process.exit(1);
  }
};

start();

closeWithGrace(
  {
    delay: 1000
  },
  async ({ err }) => {
    if (err) {
      app.log.error(err, 'Shutting down due to error');
    }
    await app.close();
  }
);
