import { z } from "zod";
import { parseKey } from "@/lib/crypto";

const MIN_SECRET_LENGTH = 32;

const base64Key32 = z.string().refine(
  (value) => {
    try {
      parseKey(value);
      return true;
    } catch {
      return false;
    }
  },
  "must be base64 of exactly 32 random bytes",
);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(MIN_SECRET_LENGTH, `BETTER_AUTH_SECRET must have at least ${MIN_SECRET_LENGTH} characters`),
  BETTER_AUTH_URL: z.url("BETTER_AUTH_URL must be a valid URL"),
  CPF_ENCRYPTION_KEY: base64Key32,
  CPF_HASH_KEY: base64Key32,
  /** Bearer key n8n uses for /api/v1 (service-to-service). Unset = those endpoints answer 503. */
  SERVICE_API_KEY: z.string().min(MIN_SECRET_LENGTH, `SERVICE_API_KEY must have at least ${MIN_SECRET_LENGTH} characters`).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

/** Validates environment variables once, failing fast with a readable message. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
