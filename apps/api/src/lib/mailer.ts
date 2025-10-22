import type { FastifyInstance } from 'fastify';
import nodemailer, { type Transporter } from 'nodemailer';

export type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
  metadata?: Record<string, unknown>;
  from?: string;
  replyTo?: string;
};

let transporter: Transporter | null = null;

const resolveTransporter = (app: FastifyInstance): Transporter => {
  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: app.env.EMAIL_SMTP_HOST,
    port: app.env.EMAIL_SMTP_PORT,
    secure: app.env.EMAIL_SMTP_SECURE ?? false,
    auth: {
      user: app.env.EMAIL_SMTP_USER,
      pass: app.env.EMAIL_SMTP_PASSWORD
    }
  });

  return transporter;
};

export const sendTransactionalEmail = async (app: FastifyInstance, payload: EmailPayload) => {
  const transport = resolveTransporter(app);
  const accountAddress = app.env.EMAIL_FROM_ACCOUNT;
  const fromAddress = payload.from ?? accountAddress;

  try {
    await transport.sendMail({
      from: fromAddress,
      sender: accountAddress,
      envelope: {
        from: accountAddress,
        to: payload.to
      },
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: payload.replyTo ?? fromAddress
    });

    app.log.info(
      {
        to: payload.to,
        from: fromAddress,
        subject: payload.subject,
        metadata: payload.metadata
      },
      'transactional email dispatched'
    );
  } catch (error) {
    app.log.error(
      {
        err: error,
        to: payload.to,
        subject: payload.subject
      },
      'failed to dispatch transactional email'
    );
    throw error;
  }
};
