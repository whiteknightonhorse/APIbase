/** T-0488: sync-counts-cron.sh runs `page-parity.py --render` on the regenerated tree and refuses to commit on red. */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const SENTENCE = 'Generated straight from the production database';
const COUNTS = 'sync-counts: live active (status != unavailable) = 1 tools / 1 providers';

const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) =>
  spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 120000 });

const git = (cwd: string, ...args: string[]) => {
  const r = run('git', args, cwd);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

/** Temp fleet tree on branch ci-staging with a local bare origin and a stubbed generator. */
function setup(mutate: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'scc-parity-'));
  const work = join(dir, 'work');
  const bare = join(dir, 'origin.git');
  mkdirSync(join(work, 'scripts/lib'), { recursive: true });
  cpSync(join(ROOT, 'scripts/lib/counts-ledger.sh'), join(work, 'scripts/lib/counts-ledger.sh'));
  cpSync(join(ROOT, 'scripts/lib/tree-hygiene.sh'), join(work, 'scripts/lib/tree-hygiene.sh'));
  mkdirSync(join(work, 'static'), { recursive: true });
  mkdirSync(join(work, 'tests/fixtures'), { recursive: true });
  for (const f of ['sync-counts-cron.sh', 'page-parity.py', 'discovery-snapshot.tsv']) {
    cpSync(join(ROOT, 'scripts', f), join(work, 'scripts', f));
  }
  cpSync(join(ROOT, 'tests/fixtures/page-baseline'), join(work, 'tests/fixtures/page-baseline'), {
    recursive: true,
  });
  cpSync(join(ROOT, 'static/catalog.html'), join(work, 'static/catalog.html'));
  const stub = mutate
    ? `python3 -I - <<'PY'\np='static/catalog.html'\ns=open(p).read()\nopen(p,'w').write(s.replace(${JSON.stringify(SENTENCE)},'X'))\nPY\n`
    : '';
  writeFileSync(
    join(work, 'scripts/sync-counts.sh'),
    `#!/usr/bin/env bash\nset -e\ncd "$ROOT"\nif false; then\n  :\nelse\n  : static/catalog.html\n${stub}fi\necho "${COUNTS}"\n`,
  );
  git(dir, 'init', '--bare', '-q', bare);
  git(work, 'init', '-q', '-b', 'ci-staging');
  git(work, 'config', 'user.email', 't@example.invalid');
  git(work, 'config', 'user.name', 'T');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'base');
  git(work, 'remote', 'add', 'origin', bare);
  git(work, 'push', '-q', 'origin', 'HEAD:ci-staging');
  git(work, 'fetch', '-q', 'origin');
  writeFileSync(join(dir, 'config.env'), 'TASK_TIMEOUT=1\n');
  const env = {
    ...process.env,
    HOME: dir,
    SYNC_COUNTS_CRON_LOCK: join(dir, 'state/worktree-fleet.lock'),
    SYNC_COUNTS_CRON_STATE_DIR: join(dir, 'state'),
    SYNC_COUNTS_CRON_LOG_DIR: join(dir, 'logs'),
    SYNC_COUNTS_CRON_CONFIG_ENV: join(dir, 'config.env'),
  };
  return { dir, work, env };
}

describe('sync-counts-cron.sh page-parity gate', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('aborts, commits nothing and leaves a clean tree when PP2 is red', () => {
    const t = setup(true);
    dir = t.dir;
    expect(readFileSync(join(t.work, 'static/catalog.html'), 'utf8')).toContain(SENTENCE);
    const r = run('bash', ['scripts/sync-counts-cron.sh'], t.work, t.env);
    expect(r.status).toBe(1);
    const log = readFileSync(join(t.dir, 'logs/sync-counts-cron.log'), 'utf8');
    expect(log).toContain('ABORT -- page-parity --render is red');
    expect(log).toContain('PARITY_FAIL');
    expect(git(t.work, 'status', '--porcelain')).toBe('');
    expect(git(t.work, 'log', 'origin/ci-staging..HEAD', '--oneline')).toBe('');
  });

  it('exits 0 with 0 drift when the generator changes nothing', () => {
    const t = setup(false);
    dir = t.dir;
    const r = run('bash', ['scripts/sync-counts-cron.sh'], t.work, t.env);
    expect(r.status).toBe(0);
    const log = readFileSync(join(t.dir, 'logs/sync-counts-cron.log'), 'utf8');
    expect(log).toContain('0 drift, nothing committed');
    expect(git(t.work, 'log', 'origin/ci-staging..HEAD', '--oneline')).toBe('');
  });
});
