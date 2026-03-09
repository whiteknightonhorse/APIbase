import { z } from 'zod';

/**
 * Zod schema for all environment variables (§12.238).
 *
 * Split into:
 *  - appEnvSchema  — vars consumed by the Node.js processes (API, Worker, Outbox)
 *  - infraEnvSchema — vars consumed only by Docker / sidecar containers
 *
 * Only appEnvSchema is validated at process startup.
 * infraEnvSchema is documented here for completeness but NOT loaded at runtime
 * (those vars are consumed by Postgres, Grafana, Alertmanager containers directly).
 */

// ---------------------------------------------------------------------------
// App-level env vars (validated at startup)
// ---------------------------------------------------------------------------
export const appEnvSchema = z.object({
  // Core
  NODE_ENV: z.enum(['production', 'development', 'test']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Database — per-process connection strings with pool limits (§12.215)
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_WORKER: z.string().min(1),
  DATABASE_URL_OUTBOX: z.string().min(1),

  // Redis (§12.214)
  REDIS_URL: z.string().min(1).default('redis://redis:6379'),

  // API key hashing salt — minimum 32 chars (§12.60)
  API_KEY_SECRET: z.string().min(32),

  // x402 payments (§8.6–8.9)
  X402_NETWORK: z.string().min(1).default('base-sepolia'),
  X402_PAYMENT_ADDRESS: z.string().min(1).default('0x0000000000000000000000000000000000000000'),
  X402_FACILITATOR_URL: z.string().url().default('https://x402.org/facilitator'),

  // Provider API keys (§5.3)
  PROVIDER_KEY_OPENWEATHER: z.string().min(1),
  PROVIDER_KEY_COINGECKO: z.string().min(1),
  PROVIDER_KEY_POLYMARKET: z.string().optional().default(''),
  PROVIDER_KEY_AVIASALES: z.string().optional().default(''),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

// ---------------------------------------------------------------------------
// Infrastructure env vars (NOT validated by Node — consumed by containers)
// Documented here so the registry (§12.238) lives in one place.
// ---------------------------------------------------------------------------
export const infraEnvSchema = z.object({
  IMAGE_TAG: z.string().default('latest'),
  POSTGRES_USER: z.string().default('apibase'),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().default('apibase'),
  PG_PASSWORD: z.string().min(1),
  GF_ADMIN_PASSWORD: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
});

export type InfraEnv = z.infer<typeof infraEnvSchema>;
