import cron, { type ScheduledTask } from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

/**
 * Registered in-process worker jobs (T-0321). Every run leaves a row in worker_job_runs and one
 * `job run` log line, so "when did this job last run, and what did it do" is answerable from
 * Postgres alone.
 */

export interface JobSpec {
  name: string;
  cron: string;
  /** Expected seconds between runs; an audit flags a job whose last_finished_at is older than 2x this. */
  expect_every_s: number;
  run: () => Promise<unknown>;
  /** Hard ceiling for one tick; a hung run is abandoned so the overlap guard cannot stay stuck. Default: max(2x expect_every_s, 5 min). */
  timeout_ms?: number;
}

const LEGACY_JOBS = 'heartbeat';

const names: string[] = [];
let prisma: PrismaClient | null = null;

function db(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

async function recordStart(job: string, expectEveryS: number): Promise<void> {
  await db().$executeRaw`
    INSERT INTO worker_job_runs (job, expect_every_s, last_started_at)
    VALUES (${job}, ${expectEveryS}, now())
    ON CONFLICT (job) DO UPDATE SET expect_every_s = EXCLUDED.expect_every_s, last_started_at = now()`;
}

// T-0586: a row exists from startup, all run columns NULL, so a monthly job is visible before its first run.
async function recordRegistered(job: string, expectEveryS: number): Promise<void> {
  await db().$executeRaw`
    INSERT INTO worker_job_runs (job, expect_every_s)
    VALUES (${job}, ${expectEveryS})
    ON CONFLICT (job) DO UPDATE SET expect_every_s = EXCLUDED.expect_every_s`;
}

async function recordFinish(
  job: string,
  expectEveryS: number,
  ok: boolean,
  result: object,
  error: string | null,
): Promise<void> {
  await db().$executeRaw`
    INSERT INTO worker_job_runs (job, expect_every_s, last_finished_at, last_ok, last_result, last_error, runs_total)
    VALUES (${job}, ${expectEveryS}, now(), ${ok}, ${JSON.stringify(result)}::jsonb, ${error}, 1)
    ON CONFLICT (job) DO UPDATE SET expect_every_s = EXCLUDED.expect_every_s,
      last_finished_at = now(), last_ok = EXCLUDED.last_ok, last_result = EXCLUDED.last_result,
      last_error = EXCLUDED.last_error, runs_total = worker_job_runs.runs_total + 1`;
}

async function safeRecord(job: string, write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (err) {
    logger.warn({ err, job }, 'job run record failed');
  }
}

export function registerJob(spec: JobSpec): ScheduledTask {
  const { name, expect_every_s } = spec;
  names.push(name);
  void safeRecord(name, () => recordRegistered(name, expect_every_s));
  const timeoutMs = spec.timeout_ms ?? Math.max(expect_every_s * 2000, 300_000);
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    try {
      const outcome = await Promise.race([execute(Date.now()), timedOut]);
      if (outcome === 'timeout') {
        logger.error(
          { job: name, timeout_ms: timeoutMs },
          'job timed out; releasing overlap guard',
        );
        // Best effort and not awaited: the DB that hung the run may still be hanging.
        void safeRecord(name, () =>
          recordFinish(name, expect_every_s, false, {}, `timed out after ${timeoutMs} ms`),
        );
      }
    } finally {
      clearTimeout(timer);
      running = false;
    }
  };

  const execute = async (t0: number): Promise<void> => {
    {
      await safeRecord(name, () => recordStart(name, expect_every_s));
      let ok = true;
      let result: object = {};
      let error: string | null = null;
      try {
        const out = await spec.run();
        result = typeof out === 'object' && out !== null ? out : {};
      } catch (err) {
        ok = false;
        error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        logger.error({ err, job: name }, 'job failed');
      }
      await safeRecord(name, () => recordFinish(name, expect_every_s, ok, result, error));
      logger.info({ job: name, ms: Date.now() - t0, ok, ...result }, 'job run');
    }
  };

  return cron.schedule(spec.cron, () => {
    tick().catch(() => {});
  });
}

export function registeredJobs(): string[] {
  return [...names];
}

export function workerStartedMessage(): string {
  return `Worker started — jobs: ${registeredJobs().join(', ')} (+ legacy: ${LEGACY_JOBS})`;
}
