// T-0322: every incident kind allowed by the latest incidents_kind_check has a routing.json entry,
// and every routing.json kind is allowed by the constraint (a kind in only one of them is either an
// INSERT the database rejects or a dead route).
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const migrationsDir = join(root, 'prisma', 'migrations');

function latestKindCheck(): string[] {
  const dirs = readdirSync(migrationsDir).sort();
  for (let i = dirs.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(migrationsDir, dirs[i], 'migration.sql'), 'utf8');
    const m = /ADD CONSTRAINT "incidents_kind_check" CHECK \("kind" IN \(([^)]*)\)\)/.exec(sql);
    if (m) return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
  }
  throw new Error('no migration defines incidents_kind_check');
}

describe('autopilot routing.json vs incidents_kind_check', () => {
  const routing = JSON.parse(
    readFileSync(join(root, 'config', 'autopilot', 'routing.json'), 'utf8'),
  );
  const kinds = latestKindCheck();

  it('every kind of the latest migration is routed', () => {
    for (const k of kinds) expect(routing).toHaveProperty([k]);
  });

  it('every routed kind is allowed by the constraint', () => {
    const routed = Object.keys(routing).filter((k) => !k.startsWith('_'));
    expect(routed.sort()).toEqual([...kinds].sort());
  });

  it('JOB_STALE is a sonnet fleet task reviewed by fable', () => {
    expect(routing.JOB_STALE).toMatchObject({
      route_class: 'AUTO',
      review: 'fable',
      fleet_task: true,
      model: 'sonnet',
    });
  });
});
