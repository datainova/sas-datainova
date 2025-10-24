import { buildApp } from "@/app";
import { env } from "@/config/env";

const start = async () => {
  const app = await buildApp();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      { port: env.PORT, host: env.HOST },
      "SaaS API listening for requests"
    );
  } catch (error) {
    app.log.error({ err: error }, "failed to start server");
    process.exit(1);
  }
};

void start();
