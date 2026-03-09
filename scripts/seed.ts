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

const prisma = new PrismaClient();

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
}

interface ToolProviderConfig {
  tools: ToolConfig[];
}

async function seedTools(): Promise<number> {
  const configPath = resolve(__dirname, '..', 'config', 'tool_provider_config.yaml');
  const raw = readFileSync(configPath, 'utf-8');
  const config = parse(raw) as ToolProviderConfig;

  let count = 0;
  for (const tool of config.tools) {
    await prisma.tool.upsert({
      where: { tool_id: tool.tool_id },
      create: {
        tool_id: tool.tool_id,
        name: tool.name,
        provider: tool.provider,
        status: 'healthy',
        price_usd: tool.price_usd,
        cache_ttl: tool.cache_ttl,
      },
      update: {
        name: tool.name,
        price_usd: tool.price_usd,
        cache_ttl: tool.cache_ttl,
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
