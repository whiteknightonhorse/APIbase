import { appEnvSchema, type AppEnv } from './env';

/**
 * Validated, frozen configuration snapshot (§12.170 configSnapshot).
 *
 * Rules:
 *  1. Parsed once at process startup via zod.
 *  2. On validation failure → log FATAL, exit(1). Fail-fast (AP-3).
 *  3. Object.freeze — config is immutable for the lifetime of the process.
 *  4. Exported as a singleton; all modules import from here.
 */

function loadConfig(): AppEnv {
  const result = appEnvSchema.safeParse(process.env);

  if (!result.success) {
    // Use process.stderr directly — logger may not be initialized yet.
    // Structured JSON so log aggregators can still parse it.
    const entry = JSON.stringify({
      level: 60, // pino FATAL
      time: Date.now(),
      msg: 'FATAL: Environment validation failed. Aborting.',
      component: 'config',
      errors: result.error.issues,
    });
    process.stderr.write(entry + '\n');

    process.exit(1);
  }

  return Object.freeze(result.data);
}

/** Immutable, validated application configuration. */
export const config: Readonly<AppEnv> = loadConfig();
