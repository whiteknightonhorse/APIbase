/**
 * APIbase.pro — Idempotent Seed Script (§12.196)
 *
 * Seeds:
 *   1. Tools from config/tool_provider_config.yaml (upsert)
 *   2. Test agent with known API key and $100 balance
 *   3. Daily partitions for today + tomorrow
 *
 * Safe to re-run (upsert everywhere). In production, blocked without ALLOW_SEED=true.
 *
 * Usage: npx tsx scripts/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';
import {
  loadYamlTools,
  planSeedRows,
  loadRetiredProviders,
  seedOnly,
  seedTools as runSeedTools,
  type FullSeedTool,
} from './seed-plan';

const prisma = new PrismaClient();

// ZZ-03-01 (2026-09-15): TOOL_DEFINITIONS[].category is the single source of truth for
// tools.category (migration 0017) — config/tool_provider_config.yaml carries no category
// field of its own. Built once at module load, same pattern as
// src/services/tool-registry.service.ts's TOOL_DESCRIPTIONS map.
const TOOL_CATEGORIES: ReadonlyMap<string, string> = new Map(
  TOOL_DEFINITIONS.map((def) => [def.toolId, def.category]),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function dateSuffix(d: Date): string {
  return formatDate(d).replace(/-/g, '_'); // YYYY_MM_DD
}

// ---------------------------------------------------------------------------
// 1. Seed tools from YAML config
// ---------------------------------------------------------------------------

interface ToolProviderConfig {
  tools: FullSeedTool[];
}

/**
 * F1/C-4: upstream_cost_usd in YAML is optional. Present -> upsert that value
 * (0 is a real, evidence-backed number, never a placeholder). Absent -> never
 * touch the DB column. T-0660: retired providers are skipped; cost_source = 'yaml:<model>'.
 * The logic lives in seed-plan.ts seedTools() so tests can drive it with a stub client.
 */
async function seedTools(dryRun: boolean): Promise<number> {
  const configPath = resolve(__dirname, '..', 'config', 'tool_provider_config.yaml');
  const config = parse(readFileSync(configPath, 'utf-8')) as ToolProviderConfig;
  // eslint-disable-next-line no-console
  const log = (l: string) => console.log(l);
  const res = await runSeedTools(
    prisma as never,
    config.tools,
    TOOL_CATEGORIES,
    loadRetiredProviders(),
    dryRun,
    log,
  );
  return res.count;
}

// ---------------------------------------------------------------------------
// 2. Seed test agent (§12.196)
// ---------------------------------------------------------------------------

const TEST_AGENT_ID = 'test-agent-001';
const TEST_API_KEY = 'ak_live_test_0000000000000000000000000000';

async function seedTestAgent(): Promise<void> {
  const keyHash = hashApiKey(TEST_API_KEY);

  await prisma.agent.upsert({
    where: { agent_id: TEST_AGENT_ID },
    create: {
      agent_id: TEST_AGENT_ID,
      api_key_hash: keyHash,
      tier: 'paid',
      status: 'active',
    },
    update: {},
  });

  await prisma.account.upsert({
    where: { agent_id: TEST_AGENT_ID },
    create: {
      agent_id: TEST_AGENT_ID,
      balance_usd: 100.0,
      is_test_account: true,
    },
    update: {},
  });
}

// ---------------------------------------------------------------------------
// 3. Create partitions for today + tomorrow
// ---------------------------------------------------------------------------

async function createPartition(table: string, date: Date): Promise<void> {
  const suffix = dateSuffix(date);
  const startDate = formatDate(date);
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const endDate = formatDate(nextDay);
  const partName = `${table}_${suffix}`;

  // Check if partition already exists (idempotent)
  const exists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = $1 AND relkind = 'r') AS exists`,
    partName,
  );

  if (exists[0]?.exists) {
    return;
  }

  await prisma.$executeRawUnsafe(
    `CREATE TABLE ${partName} PARTITION OF ${table} FOR VALUES FROM ('${startDate}') TO ('${endDate}')`,
  );
}

async function seedPartitions(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const tables = ['execution_ledger', 'outbox', 'request_metrics'];

  for (const table of tables) {
    await createPartition(table, today);
    await createPartition(table, tomorrow);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * T-0333: `--only id1,id2 [--dry-run]` seeds exactly the named tools (create-only, existing
 * rows untouched), skipping the test agent and partitions. --dry-run prints rows, writes nothing.
 */
async function mainOnly(ids: string[], dryRun: boolean): Promise<void> {
  const rows = planSeedRows(loadYamlTools(), TOOL_CATEGORIES, ids, loadRetiredProviders());
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(`${r.tool_id}\tprice_usd=${r.price_usd}\tstatus=${r.status}`);
  }
  const res = await seedOnly(prisma as never, rows, dryRun);
  // eslint-disable-next-line no-console
  console.log(
    `[seed] --only ${dryRun ? '(dry-run, 0 writes) ' : ''}would create/created ${res.created.length}, skipped existing ${res.skipped.length}`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const onlyIdx = argv.indexOf('--only');
  if (onlyIdx !== -1) {
    const ids = (argv[onlyIdx + 1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) throw new Error('seed: --only requires a comma-separated tool_id list');
    return mainOnly(ids, argv.includes('--dry-run'));
  }
  if (argv.includes('--dry-run')) {
    // T-0660: full-upsert preview; reads the DB, writes nothing.
    await seedTools(true);
    return;
  }
  // eslint-disable-next-line no-console
  console.log('[seed] Starting...');

  const toolCount = await seedTools(false);
  // eslint-disable-next-line no-console
  console.log(`[seed] Upserted ${toolCount} tools`);

  await seedTestAgent();
  // eslint-disable-next-line no-console
  console.log(`[seed] Test agent seeded: ${TEST_AGENT_ID}`);

  await seedPartitions();
  // eslint-disable-next-line no-console
  console.log('[seed] Partitions created (today + tomorrow)');

  // eslint-disable-next-line no-console
  console.log('[seed] Done.');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] FATAL:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
