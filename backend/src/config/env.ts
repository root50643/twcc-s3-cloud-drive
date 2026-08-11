import { z } from "zod";

const booleanFromString = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined || value === "") {
      return false;
    }
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  });

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z.string().min(24, "SESSION_SECRET must be at least 24 characters"),
  DATABASE_FILE: z.string().default("../data/app.sqlite"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  COOKIE_SECURE: booleanFromString.default("false"),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(60),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_LIMIT_PER_USERNAME: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_PER_IP: z.coerce.number().int().positive().default(30),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanFromString.default("true"),
  SIGNED_URL_EXPIRES_SECONDS: z.coerce.number().int().min(30).max(3600).default(300)
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid server configuration: ${messages}`);
  }
  return parsed.data;
}
