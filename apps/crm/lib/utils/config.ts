import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  CHANNEL_SERVICE_URL: z.string().min(1),
  WEBHOOK_BASE_URL: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(32),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// Throws at import time if env is misconfigured — fail fast, not silently
export const config = EnvSchema.parse(process.env);
