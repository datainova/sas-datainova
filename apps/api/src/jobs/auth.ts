import type { FastifyInstance } from 'fastify';
import type pgBoss from 'pg-boss';
import { sendTransactionalEmail } from '../lib/mailer';

type SignupEmailJob = {
  email: string;
  token: string;
  expiresAt: string;
};

type PasswordResetEmailJob = {
  email: string;
  token: string;
  expiresAt: string;
};

const diffInMinutes = (expiryIso: string) => {
  const expires = new Date(expiryIso).getTime();
  if (Number.isNaN(expires)) return 0;
  return Math.max(0, Math.round((expires - Date.now()) / (60 * 1000)));
};

export const registerAuthJobs = async (app: FastifyInstance, boss: pgBoss) => {
  await boss.createQueue('auth.signup.sendEmail', { retryLimit: 3 });
  await boss.createQueue('auth.passwordReset.sendEmail', { retryLimit: 3 });

  await boss.work<SignupEmailJob>('auth.signup.sendEmail', { includeMetadata: true }, async (job) => {
    const [item] = Array.isArray(job) ? job : [job];
    if (!item) return;
    app.log.info({ jobId: (item as any).id, queue: 'auth.signup.sendEmail' }, 'auth signup email job received');
    const payload = (item as any).data ?? item;
    if (!payload?.email || !payload?.token || !payload?.expiresAt) {
      app.log.error({ jobId: job.id, data: payload }, 'invalid signup email payload');
      return;
    }

    const finalizeUrl = new URL('/signup/complete', app.env.FRONTEND_URL);
    finalizeUrl.search = new URLSearchParams({ token: payload.token }).toString();
    const minutes = diffInMinutes(payload.expiresAt) || app.env.AUTH_SIGNUP_TOKEN_TTL_MINUTES;

    await sendTransactionalEmail(app, {
      to: payload.email,
      subject: 'Confirme seu cadastro — DataInova',
      text: [
        'Olá! Recebemos seu email.',
        `Para finalizar seu cadastro, use o link: ${finalizeUrl.toString()}`,
        `Este link expira em ${minutes} minutos.`
      ].join('\n'),
      html: `
        <p>Olá! Recebemos seu email.</p>
        <p>Para finalizar seu cadastro, clique no link abaixo:</p>
        <p><a href="${finalizeUrl.toString()}">Finalizar cadastro</a></p>
        <p>Este link expira em ${minutes} minutos.</p>
      `,
      from: app.env.EMAIL_FROM_SIGNUP ?? app.env.EMAIL_FROM_ACCOUNT,
      replyTo: app.env.EMAIL_FROM_SIGNUP ?? app.env.EMAIL_FROM_ACCOUNT,
      metadata: {
        type: 'signup',
        expiresAt: payload.expiresAt
      }
    });
  });

  await boss.work<PasswordResetEmailJob>('auth.passwordReset.sendEmail', { includeMetadata: true }, async (job) => {
    const [item] = Array.isArray(job) ? job : [job];
    if (!item) return;
    app.log.info({ jobId: (item as any).id, queue: 'auth.passwordReset.sendEmail' }, 'auth password reset email job received');
    const payload = (item as any).data ?? item;
    if (!payload?.email || !payload?.token || !payload?.expiresAt) {
      app.log.error({ jobId: job.id, data: payload }, 'invalid reset email payload');
      return;
    }

    const resetUrl = new URL('/password/reset', app.env.FRONTEND_URL);
    resetUrl.search = new URLSearchParams({ token: payload.token }).toString();
    const minutes = diffInMinutes(payload.expiresAt) || app.env.AUTH_RESET_TOKEN_TTL_MINUTES;

    await sendTransactionalEmail(app, {
      to: payload.email,
      subject: 'Redefina sua senha — DataInova',
      text: [
        'Recebemos uma solicitação para redefinir sua senha.',
        `Use o link a seguir nas próximas ${minutes} minutos: ${resetUrl.toString()}`,
        'Se não foi você, ignore este email.'
      ].join('\n'),
      html: `
        <p>Recebemos uma solicitação para redefinir sua senha.</p>
        <p>Use o link abaixo dentro de ${minutes} minutos:</p>
        <p><a href="${resetUrl.toString()}">Redefinir senha</a></p>
        <p>Se não foi você, ignore este email.</p>
      `,
      from: app.env.EMAIL_FROM_RECOVERY ?? app.env.EMAIL_FROM_ACCOUNT,
      replyTo: app.env.EMAIL_FROM_RECOVERY ?? app.env.EMAIL_FROM_ACCOUNT,
      metadata: {
        type: 'password_reset',
        expiresAt: payload.expiresAt
      }
    });
  });
};
