import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  TOKEN_VAULT_MASTER_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)'),
  SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(10).optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v23.0'),
  ENABLE_EXTERNAL_ALERTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated lazily at first use so builds do not require runtime secrets. */
export function env(): Env {
  if (cached) return cached;
  const cleaned = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  cached = parsed.data;
  return cached;
}
