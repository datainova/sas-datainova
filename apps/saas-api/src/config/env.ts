import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const booleanFromEnv = (fallback: boolean) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      if (typeof value === "boolean") {
        return value;
      }

      if (typeof value === "number") {
        return value !== 0;
      }

      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        if (normalized === "") {
          return undefined;
        }

        if (["1", "true", "yes", "y", "on"].includes(normalized)) {
          return true;
        }

        if (["0", "false", "no", "n", "off"].includes(normalized)) {
          return false;
        }
      }

      return undefined;
    }, z.boolean())
    .optional()
    .default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().min(0).default(3333),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 characters")
    .default("dev-secret-change-me"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, "JWT_REFRESH_SECRET must be at least 16 characters")
    .default("dev-refresh-secret-change-me"),
  CORS_ORIGINS: z.string().optional(),
  SMTP_URL: z
    .string()
    .optional()
    .refine((value) => {
      if (!value) {
        return true;
      }
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }, "SMTP_URL must be a valid URL"),
  SMTP_FROM: z.string().email().default("no-reply@datainova.com"),
  MAGIC_LINK_BASE_URL: z.string().url().default("http://localhost:5173"),
  MCP_ENABLED: booleanFromEnv(false),
  MCP_SSE_ENABLED: booleanFromEnv(false),
  MCP_WS_ENABLED: booleanFromEnv(false),
});

export const env = envSchema.parse(process.env);

export const allowedCorsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : [];
