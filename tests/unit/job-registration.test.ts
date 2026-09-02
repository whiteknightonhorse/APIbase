/**
 * F1 gate: a job file with a `run()` export is dead code unless some server.ts actually
 * imports and schedules it. `partition-cleanup.job.ts` had a green unit test and a real
 * `run()` for months while zero production process ever called it -- the moderation-policy
 * "deleted automatically" promise and partition/outbox cleanup silently never ran.
 *
 * This test doesn't prove the job is *scheduled correctly* (wrong cron string, never
 * `.stop()`-ed, etc.) -- only that it is imported by name from at least one `**\/server.ts`
 * entry point. That's cheap, mechanical, and catches exactly the F1 shape: a file that exists,
 * is tested, and is never wired in.
 *
 * ALLOWLIST: jobs intentionally not registered in any server.ts (e.g. a one-off migration
 * script, or a job invoked only from a CLI/cron script outside this process tree). Add a
 * one-line reason -- an empty allowlist entry defeats the gate.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const JOBS_DIR = join(__dirname, '../../src/jobs');

// job basename (without .job.ts) -> reason it is deliberately NOT registered in any server.ts
const ALLOWLIST: Record<string, string> = {};

function findServerFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      found.push(...findServerFiles(full));
    } else if (entry.name === 'server.ts') {
      found.push(full);
    }
  }
  return found;
}

describe('every jobs/*.job.ts with run() is registered somewhere (F1 gate)', () => {
  const jobFiles = readdirSync(JOBS_DIR).filter((f) => f.endsWith('.job.ts'));
  const serverFiles = findServerFiles(join(__dirname, '../../src'));
  const serverSource = serverFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

  it('found at least one server.ts to check against', () => {
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  for (const jobFile of jobFiles) {
    const jobPath = join(JOBS_DIR, jobFile);
    const source = readFileSync(jobPath, 'utf8');
    const hasRun = /export\s+(async\s+)?function\s+run\s*\(/.test(source);
    const jobName = jobFile.replace(/\.job\.ts$/, '');

    if (!hasRun) continue; // no run() exported -- nothing for a server.ts to call

    it(`${jobFile}: run() is imported by some server.ts (or allowlisted)`, () => {
      if (ALLOWLIST[jobName]) {
        return; // deliberate exception, reason recorded above
      }
      const imported =
        serverSource.includes(`jobs/${jobName}.job'`) ||
        serverSource.includes(`jobs/${jobName}.job"`);
      expect(imported).toBe(true);
    });
  }
});
