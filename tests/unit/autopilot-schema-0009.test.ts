/**
 * AP-1 (2026-09-03): migration 0009 — provider_status, probe_log, incidents (+the
 * partial-unique dedup lock), email_events, Tool.status_source/changed_at/reason.
 * See ~/AUTOPILOT-DESIGN-2026-09-03.md section E for the design this implements.
 *
 * Scope, disclosed (same convention as moderation-content-retention.test.ts): CI has
 * no live Postgres (checked: no DATABASE_URL, no postgres service, in any workflow),
 * so this suite proves the SHAPE — every enum value list is the single source of
 * truth compared three ways (this file's canonical arrays, the schema.prisma doc
 * comment, and the migration's CHECK constraint), and the partial-unique-index /
 * CHECK-constraint / ALTER TABLE statements are the exact, literal SQL, not a
 * substring match a broken migration could still satisfy.
 *
 * The REAL enforcement (a bad enum value rejected, a second open incident with the
 * same dedup_key rejected, the same dedup_key reopenable once RESOLVED) was verified
 * live once against a disposable `postgres:16.2-alpine` container started for this
 * task and torn down after — never against the project's production Postgres
 * (apibase-postgres-1), which this task does not touch. That run is not repeatable
 * by CI, hence the shape-proof here; a future AP task that spins up Postgres in CI
 * can promote this to a real assertion without changing the migration.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '../..');
const migrationSql = readFileSync(
  join(repoRoot, 'prisma/migrations/0009_autopilot_schema/migration.sql'),
  'utf8',
);
const schemaPrisma = readFileSync(join(repoRoot, 'prisma/schema.prisma'), 'utf8');

// ---------------------------------------------------------------------------
// schema.prisma comment extraction — mirrors how a human reads the file: an
// inline "// A | B | C" comment on the field's own line, or (if the field has
// none) the nearest preceding comment-only line that itself contains a '|'.
// ---------------------------------------------------------------------------
function modelBlock(modelName: string): string {
  const re = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`, 'm');
  const m = schemaPrisma.match(re);
  if (!m) throw new Error(`model ${modelName} not found in schema.prisma`);
  return m[1];
}

function fieldEnumComment(block: string, fieldName: string): string {
  const lines = block.split('\n');
  const idx = lines.findIndex((l) => new RegExp(`^\\s*${fieldName}\\b`).test(l));
  if (idx === -1) throw new Error(`field ${fieldName} not found`);
  const inline = lines[idx].match(/\/\/\s*(.+)$/);
  if (inline && inline[1].includes('|')) return inline[1];
  for (let i = idx - 1; i >= 0 && /^\s*\/\//.test(lines[i]); i--) {
    const text = lines[i].replace(/^\s*\/\/\s*/, '');
    if (text.includes('|')) return text;
  }
  throw new Error(`no enum comment (line with '|') found above/on field ${fieldName}`);
}

function parseEnumList(raw: string): string[] {
  return raw
    .replace(/^enum(\s*§H3)?:\s*/i, '')
    .split('|')
    .map((s) => s.replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// migration.sql CHECK constraint extraction — the list inside the named
// constraint's `IN (...)`. Our CHECK SQL never nests parens inside the value
// list, so a non-greedy match up to the first `)` is exact, not a substring cheat.
// ---------------------------------------------------------------------------
function checkConstraintValues(constraintName: string): string[] {
  const re = new RegExp(`CONSTRAINT "${constraintName}"[\\s\\S]*?IN\\s*\\(([^)]+)\\)`, 'm');
  const m = migrationSql.match(re);
  if (!m) throw new Error(`CHECK constraint ${constraintName} not found in migration.sql`);
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Canonical enum lists (design doc F1 / F2 / H3 / E1-E5) — the single source of
// truth this test cross-checks both other copies against.
// ---------------------------------------------------------------------------
const PROVIDER_STATE = ['UNKNOWN', 'HEALTHY', 'DEGRADED', 'DOWN'];
const PROBE_RESULT = ['OK', 'FAIL_TRANSIENT', 'FAIL_DETERMINISTIC', 'SKIPPED_BUDGET', 'NOINFO'];
const RISK = ['NOINFO', 'NORMAL', 'ATTENTION', 'WARNING', 'CRITICAL', 'EXHAUSTED'];
const PROBE_KIND = ['head', 'get', 'auth', 'usage_api', 'passive', 'suppressed'];
const INCIDENT_KIND = [
  'AUTH_FAILED',
  'CREDENTIAL_EXPIRED',
  'PROVIDER_DOWN',
  'DEGRADED_QUALITY',
  'RATE_LIMITED',
  'QUOTA_LOW',
  'QUOTA_EXHAUSTED',
  'PAYMENT_REQUIRED',
  'API_CHANGED',
  'ENDPOINT_CHANGED',
  'EMAIL_NOTICE',
  'UNKNOWN',
];
const INCIDENT_SEVERITY = ['SEV1', 'SEV2', 'SEV3'];
const INCIDENT_STATE = [
  'OPEN',
  'REMEDIATION_QUEUED',
  'WAITING_HUMAN',
  'VERIFYING',
  'RESOLVED',
  'STUCK',
];
const INCIDENT_DETECTED_BY = ['probe', 'passive', 'limits', 'email', 'tester', 'manual'];
const EMAIL_CLASS = [
  'KEY_EXPIRES',
  'KEY_REVOKED',
  'DEPRECATION',
  'SUNSET',
  'ENDPOINT_CHANGE',
  'PRICING_CHANGE',
  'PAYMENT_FAILED',
  'QUOTA',
  'MAINTENANCE',
  'SECURITY_CHANGE',
  'ACCOUNT_ACTION',
  'MARKETING',
  'UNMATCHED',
  'DEFERRED_BUDGET',
];
const TOOL_STATUS_SOURCE = ['manual', 'autopilot', 'seed'];

describe('AP-1 migration 0009 — enum value lists (schema comment == migration CHECK == design)', () => {
  const cases: Array<[string, string, string, string[]]> = [
    ['ProviderStatus', 'state', 'provider_status_state_check', PROVIDER_STATE],
    [
      'ProviderStatus',
      'last_probe_result',
      'provider_status_last_probe_result_check',
      PROBE_RESULT,
    ],
    ['ProviderStatus', 'risk', 'provider_status_risk_check', RISK],
    ['ProbeLog', 'kind', 'probe_log_kind_check', PROBE_KIND],
    ['ProbeLog', 'result', 'probe_log_result_check', PROBE_RESULT],
    ['Incident', 'kind', 'incidents_kind_check', INCIDENT_KIND],
    ['Incident', 'severity', 'incidents_severity_check', INCIDENT_SEVERITY],
    ['Incident', 'state', 'incidents_state_check', INCIDENT_STATE],
    ['Incident', 'detected_by', 'incidents_detected_by_check', INCIDENT_DETECTED_BY],
    ['EmailEvent', 'class', 'email_events_class_check', EMAIL_CLASS],
  ];

  it.each(cases)(
    '%s.%s: comment and CHECK constraint both equal the canonical list',
    (model, field, constraint, expected) => {
      expect(parseEnumList(fieldEnumComment(modelBlock(model), field))).toEqual(expected);
      expect(checkConstraintValues(constraint)).toEqual(expected);
    },
  );

  it('Tool.status_source: comment and CHECK constraint both equal the canonical list', () => {
    expect(parseEnumList(fieldEnumComment(modelBlock('Tool'), 'status_source'))).toEqual(
      TOOL_STATUS_SOURCE,
    );
    // tools_status_source_check is nullable-guarded (IS NULL OR ... IN (...)), same
    // "IN (" anchor still finds the right list.
    expect(checkConstraintValues('tools_status_source_check')).toEqual(TOOL_STATUS_SOURCE);
  });

  it('a defect (dropped/renamed CHECK value) would fail this suite: sanity-check the harness itself', () => {
    // Not a real mutation of the SQL file -- proves parseEnumList/checkConstraintValues
    // actually discriminate, so an all-green run above isn't just "regex matched nothing".
    expect(checkConstraintValues('incidents_severity_check')).not.toEqual(['SEV1', 'SEV2']);
    expect(() => checkConstraintValues('does_not_exist_check')).toThrow();
  });
});

describe('AP-1 migration 0009 — tables, indexes, and the dedup lock', () => {
  it('creates all four new tables', () => {
    for (const table of ['provider_status', 'probe_log', 'incidents', 'email_events']) {
      expect(migrationSql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS "${table}" \\(`));
    }
  });

  it('probe_log is indexed on (provider, ts) — E2 access pattern', () => {
    expect(migrationSql).toMatch(
      /CREATE INDEX IF NOT EXISTS "probe_log_provider_ts_idx" ON "probe_log" \("provider", "ts"\);/,
    );
  });

  it('incidents is indexed on (state, severity) — dashboard/engine access pattern', () => {
    expect(migrationSql).toMatch(
      /CREATE INDEX IF NOT EXISTS "incidents_state_severity_idx" ON "incidents" \("state", "severity"\);/,
    );
  });

  it('the two-fixers lock is a PARTIAL unique index, not a plain one (§11/I3)', () => {
    // Exact literal match: a plain `CREATE UNIQUE INDEX ... ON incidents (dedup_key)`
    // with no WHERE clause would also satisfy a loose "contains UNIQUE INDEX" check,
    // but would permanently block reopening a dedup_key once ever resolved -- the
    // defect this test exists to catch.
    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "incidents_open_dedup"\s+ON "incidents" \("dedup_key"\)\s+WHERE "state" NOT IN \('RESOLVED'\);/,
    );
  });

  it('Tool gets status_source/status_changed_at/status_reason, additively (E5)', () => {
    expect(migrationSql).toMatch(
      /ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "status_source" TEXT;/,
    );
    expect(migrationSql).toMatch(
      /ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "status_changed_at" TIMESTAMPTZ;/,
    );
    expect(migrationSql).toMatch(
      /ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "status_reason" TEXT;/,
    );
  });

  it('provider_status never defaults pct_remaining/reliability_score to a number (C0.3: NOINFO != healthy)', () => {
    const block = migrationSql.slice(
      migrationSql.indexOf('CREATE TABLE IF NOT EXISTS "provider_status"'),
      migrationSql.indexOf('CREATE TABLE IF NOT EXISTS "probe_log"'),
    );
    expect(block).toMatch(/"pct_remaining"\s+INTEGER,/); // nullable, no DEFAULT
    expect(block).toMatch(/"reliability_score"\s+INTEGER,/); // nullable, no DEFAULT
  });
});

describe('AP-1 — prisma models exist and map to the migration table names', () => {
  it('4 new models, mapped 1:1 to the 4 new tables', () => {
    expect(schemaPrisma).toMatch(/model ProviderStatus \{[\s\S]*?@@map\("provider_status"\)/);
    expect(schemaPrisma).toMatch(/model ProbeLog \{[\s\S]*?@@map\("probe_log"\)/);
    expect(schemaPrisma).toMatch(/model Incident \{[\s\S]*?@@map\("incidents"\)/);
    expect(schemaPrisma).toMatch(/model EmailEvent \{[\s\S]*?@@map\("email_events"\)/);
  });

  it('Tool model carries the three new audit fields', () => {
    const tool = modelBlock('Tool');
    expect(tool).toMatch(/status_source\s+String\?/);
    expect(tool).toMatch(/status_changed_at\s+DateTime\?\s+@db\.Timestamptz\(\)/);
    expect(tool).toMatch(/status_reason\s+String\?/);
  });
});
