import fp from "fastify-plugin";
import nodemailer from "nodemailer";
import type { FastifyInstance } from "fastify";

import { env } from "@/config/env";

async function createMailer(fastify: FastifyInstance) {
  if (!env.SMTP_URL) {
    fastify.log.warn(
      "SMTP_URL is not configured; e-mails will not be sent."
    );
    return null;
  }

  const transporter = nodemailer.createTransport(env.SMTP_URL);

  try {
    await transporter.verify();
    fastify.log.info("SMTP connection verified.");
  } catch (error) {
    fastify.log.error({ err: error }, "Failed to verify SMTP configuration.");
  }

  return transporter;
}

export const mailerPlugin = fp(async (fastify) => {
  const transporter = await createMailer(fastify);

  fastify.decorate("mailer", transporter);

  fastify.addHook("onClose", async () => {
    await transporter?.close();
  });
});
