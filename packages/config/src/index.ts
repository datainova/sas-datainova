import { z } from 'zod';

export const appEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((port) => parseInt(port, 10)),
  DATABASE_URL: z.string(),
  CHROMA_URL: z.string().url().optional(),
  JWT_PUBLIC_KEY: z.string(),
  JWT_PRIVATE_KEY: z.string(),
  JWT_ISSUER: z.string(),
  AGENT_SIGNING_SECRET: z.string().min(32),
  AUTH_PASSWORD_PEPPER: z.string().min(16),
  AUTH_ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AUTH_SIGNUP_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  AUTH_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  FRONTEND_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  EMAIL_SMTP_HOST: z.string(),
  EMAIL_SMTP_PORT: z.coerce.number().int().positive(),
  EMAIL_SMTP_SECURE: z.coerce.boolean().optional(),
  EMAIL_SMTP_USER: z.string(),
  EMAIL_SMTP_PASSWORD: z.string(),
  EMAIL_FROM_ACCOUNT: z.string().email(),
  EMAIL_FROM_SIGNUP: z.string().email().optional(),
  EMAIL_FROM_RECOVERY: z.string().email().optional(),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  HUBSPOT_WEBHOOK_SECRET: z.string().optional(),
  HUBSPOT_ACCESS_TOKEN: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional()
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export const loadEnv = (input: NodeJS.ProcessEnv): AppEnv => {
  const parsed = appEnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`
    );
  }
  return parsed.data;
};
