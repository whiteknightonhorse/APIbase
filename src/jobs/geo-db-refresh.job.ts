import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { logger } from '../config/logger';

const SCRIPT = resolve(__dirname, '../../scripts/geo-db-refresh.sh');

/**
 * Monthly DB-IP Country Lite refresh for the UC-22 registration rule (cron wiring in
 * worker/server.ts). Rejects when the script fails, so worker_job_runs records the failure.
 */
export async function run(): Promise<void> {
  const out = await new Promise<string>((ok, bad) => {
    execFile('sh', [SCRIPT], { timeout: 5 * 60_000 }, (err, stdout, stderr) =>
      err
        ? bad(new Error(`geo-db-refresh failed: ${String(stderr || err.message).trim()}`))
        : ok(stdout),
    );
  });
  logger.info({ job: 'geo-db-refresh', result: out.trim() }, 'geo db refreshed');
}
