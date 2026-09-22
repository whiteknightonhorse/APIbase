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

const prisma = new PrismaClient();

// ZZ-03-01 (2026-09-15): TOOL_DEFINITIONS[].category is the single source of truth for
// tools.category (migration 0017) — config/tool_provider_config.yaml carries no category
// field of its own. Built once at module load, same pattern as
// src/services/tool-registry.service.ts's TOOL_DESCRIPTIONS map.
const TOOL_CATEGORIES: ReadonlyMap<string, string> = new Map(
  TOOL_DEFINITIONS.map((def) => [def.toolId, def.category]),
);

/**
 * namespace = old prefix-derived value (tool_id.split('.')[0], falling back to provider for
 * a dot-less tool_id) that REST used to call 'category' — see migration 0017 for why this
 * stays a real column instead of a read-time computation.
 */
function namespaceOf(toolId: string, provider: string): string {
  return toolId.includes('.') ? toolId.split('.')[0] : provider;
}

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

interface ToolConfig {
  tool_id: string;
  name: string;
  provider: string;
  price_usd: string;
  cache_ttl: number;
  // F1/C-4: optional — absent means "not yet migrated", NOT "free". See
  // config/tool_provider_config.yaml header + scripts/migrate-upstream-cost.py.
  upstream_cost_usd?: string;
  // T-0207 (ZZ-03-07): optional — absent means "not part of a declared capability group" (the
  // overwhelming majority of tools). Backfills tools.capability/tools.scope (migration 0020),
  // an SQL-queryable mirror of the same fields src/services/capability-registry.service.ts
  // reads straight from this YAML at runtime. `same_upstream_as` (also declared in the YAML)
  // has no DB column at all — see schema.prisma's Tool model comment — so it is read here only
  // for gap-checking (a capability with no scope, or vice versa, is a broken declaration) and
  // otherwise ignored by this script.
  capability?: string;
  scope?: string;
  same_upstream_as?: string[];
}

interface ToolProviderConfig {
  tools: ToolConfig[];
}

/**
 * F1/C-4: upstream_cost_usd in YAML is optional. Present -> upsert that value
 * (0 is a real, evidence-backed number, never a placeholder). Absent -> never
 * touch the DB column, so a bounded migration pass (config/tool_provider_config.yaml
 * header, scripts/migrate-upstream-cost.py) never gets silently reverted by an
 * unrelated re-seed (e.g. onboarding a new provider re-runs this over the whole file).
 */
async function seedTools(): Promise<number> {
  const configPath = resolve(__dirname, '..', 'config', 'tool_provider_config.yaml');
  const raw = readFileSync(configPath, 'utf-8');
  const config = parse(raw) as ToolProviderConfig;

  let count = 0;
  for (const tool of config.tools) {
    // ZZ-03-01: category has no NULL fallback (migration 0017 made it NOT NULL) — a
    // tool_id in the yaml with no TOOL_DEFINITIONS entry is a broken catalog, not a value
    // to guess at. Fail the whole seed loudly instead of writing a wrong/empty category.
    const category = TOOL_CATEGORIES.get(tool.tool_id);
    if (!category) {
      throw new Error(
        `seedTools: '${tool.tool_id}' is in config/tool_provider_config.yaml but has no ` +
          `TOOL_DEFINITIONS entry (src/mcp/tool-definitions.ts) — cannot derive category.`,
      );
    }
    const namespace = namespaceOf(tool.tool_id, tool.provider);

    // T-0207: capability and scope are always declared together or not at all — a tool_id with
    // one but not the other is a broken YAML entry (the alternatives matcher treats a null
    // scope as "never suggest", so a capability with no scope would silently never appear as
    // anyone's alternative — fail loud instead of seeding that quietly).
    if ((tool.capability === undefined) !== (tool.scope === undefined)) {
      throw new Error(
        `seedTools: '${tool.tool_id}' declares only one of capability/scope — both or neither ` +
          `are required (config/tool_provider_config.yaml).`,
      );
    }

    await prisma.tool.upsert({
      where: { tool_id: tool.tool_id },
      create: {
        tool_id: tool.tool_id,
        name: tool.name,
        provider: tool.provider,
        status: 'healthy',
        price_usd: tool.price_usd,
        cache_ttl: tool.cache_ttl,
        upstream_cost_usd: tool.upstream_cost_usd ?? null,
        category,
        namespace,
        capability: tool.capability ?? null,
        scope: tool.scope ?? null,
      },
      update: {
        name: tool.name,
        price_usd: tool.price_usd,
        cache_ttl: tool.cache_ttl,
        // Omit (not null) when absent from YAML — see comment above seedTools().
        ...(tool.upstream_cost_usd !== undefined
          ? { upstream_cost_usd: tool.upstream_cost_usd }
          : {}),
        category,
        namespace,
        capability: tool.capability ?? null,
        scope: tool.scope ?? null,
      },
    });
    count++;
  }

  return count;
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

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[seed] Starting...');

  const toolCount = await seedTools();
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
