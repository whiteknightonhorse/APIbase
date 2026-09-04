/**
 * AP-11 (820-autopilot-drills.md) — the "prove the API layer" leg of the
 * DOWN-provider / 401 drills. Run standalone (`npx tsx
 * scripts/autopilot/drill-verify-api.ts <provider>`) against a DATABASE_URL
 * pointed at the disposable Postgres scripts/autopilot/drill-incident-
 * lifecycle.py spins up — same "one-off live-DB confirmation, not
 * CI-repeatable" posture already established and disclosed for AP-9 (see
 * tests/unit/dashboard-autopilot-status.test.ts's own header comment).
 *
 * Calls the REAL, shipped code — not a reimplementation:
 *   - src/services/incidents.service.ts's listIncidents()/getIncidentById()
 *     (L1's public incidents projection) via a REAL PrismaClient.
 *   - The exact dashboard provider_status/incidents JOIN query text from
 *     src/services/dashboard.service.ts, extracted PROGRAMMATICALLY from the
 *     source file at run time (regex on the $queryRawUnsafe(`...`) block)
 *     rather than hand-copied — a hand copy silently drifts the next time
 *     that query changes; this doesn't. Narrowed to one provider by splicing
 *     an extra condition onto the query's own existing WHERE clause.
 *
 * Deliberately does NOT call dashboard.service.ts's own getDashboardData():
 * that function iterates every REAL provider in config/provider-limits.json,
 * calls ensureRedisConnected() (would try to reach whatever REDIS_URL is in
 * this process's environment — during a drill that must never be a real
 * Redis instance), and for any `paid_balance` provider calls out to a REAL
 * external balance API. None of that is a boundary this drill may cross —
 * see AUTOPILOT-PROGRESS.md's T-820 entry for the full reasoning. The exact
 * SQL text extraction above gets the same provider_status/incidents JOIN
 * proof without any of those side effects.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { listIncidents, getIncidentById } from '../../src/services/incidents.service';

async function main() {
  const provider = process.argv[2];
  const incidentId = process.argv[3] || null;
  if (!provider) {
    console.error('usage: drill-verify-api.ts <provider> [incident_id]');
    process.exit(2);
  }

  const out: Record<string, unknown> = {};

  // --- incidents.service.ts, real code, real Prisma (DATABASE_URL from env) ---
  out.incidents = await listIncidents({ provider });
  if (incidentId) {
    out.incident_by_id = await getIncidentById(incidentId);
  }

  // --- dashboard.service.ts's exact provider_status/incidents JOIN, extracted
  // from source (not getDashboardData() itself — see header) ---
  const dashboardSrc = readFileSync(
    path.join(__dirname, '..', '..', 'src', 'services', 'dashboard.service.ts'),
    'utf-8',
  );
  const match = dashboardSrc.match(/\$queryRawUnsafe\(`([\s\S]*?)`\)/);
  if (!match) {
    console.error(
      'drill-verify-api: could not find the $queryRawUnsafe(`...`) block in dashboard.service.ts — has it moved?',
    );
    process.exit(1);
  }
  // The shipped query has no WHERE on provider (it returns every provider in
  // one pass, GROUP BY t.provider). Narrow to just the drill's synthetic row
  // by splicing an extra `t.provider = '...' AND` onto its EXISTING WHERE
  // clause (matched literally, not appended after ORDER BY — the query is a
  // single SELECT, nothing may follow ORDER BY) — every other byte of the
  // shipped SELECT list/JOINs/GROUP BY stays exactly as extracted.
  const providerLit = `'${provider.replace(/'/g, "''")}'`;
  const anchor = 'WHERE (t.status';
  if (!match[1].includes(anchor)) {
    console.error(
      `drill-verify-api: expected WHERE clause anchor ${JSON.stringify(anchor)} not found in the extracted dashboard query — has it moved?`,
    );
    process.exit(1);
  }
  const sql = match[1].replace(anchor, `WHERE t.provider = ${providerLit} AND (t.status`);
  const prisma = new PrismaClient();
  try {
    out.dashboard_row = await prisma.$queryRawUnsafe(sql);
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
}

main().catch((err) => {
  console.error('drill-verify-api failed:', err);
  process.exit(1);
});
