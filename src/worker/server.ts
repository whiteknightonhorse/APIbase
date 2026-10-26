import Redis from 'ioredis';
import cron from 'node-cron';
import {
  registerJob as registerJobTracked,
  workerStartedMessage,
  type JobSpec,
} from './job-runner';
import { config } from '../config';
import { logger } from '../config/logger';
import { createHealthServer, updateHeartbeatTimestamp } from './health';
import { run as runReconciliation } from '../jobs/reconciliation.job';
import { run as runProviderHealth } from '../jobs/provider-health.job';
import { run as runX402Health } from '../jobs/x402-health.job';
import { run as runPartitionCreate } from '../jobs/partition-create.job';
import { run as runToolQuality } from '../jobs/tool-quality.job';
import { run as runPartitionCleanup } from '../jobs/partition-cleanup.job';
import { run as runOfacSdnSync } from '../jobs/ofac-sdn-sync.job';
import {
  run as runShopPaymentReconcile,
  runDailySample as runShopPaymentSample,
} from '../jobs/shop-payment-reconcile.job';
import { run as runX402SettlePending } from '../jobs/x402-settle-pending.job';
import { runShopFeeInvoice } from '../jobs/shop-fee-invoice.job';
import { backfillContentHashes, run as runCatalogRemoderate } from '../jobs/catalog-remoderate.job';
import { runShopSlaSweeper } from '../jobs/shop-sla-sweeper.job';
import { run as runGeoDbRefresh } from '../jobs/geo-db-refresh.job';
import { runShopDomainVerify } from '../jobs/shop-domain-verify.job';
import { runShopProvekRegistrySync } from '../jobs/shop-provek-registry-sync.job';
import { runShopStorefrontProbe } from '../jobs/shop-storefront-probe.job';
import { runShopCatalogImportJob } from '../jobs/shop-catalog-import.job';
import { runShopStreamSettle } from '../jobs/shop-stream-settle.job';
import { runShopSubscriptionSweep } from '../jobs/shop-subscription-sweep.job';
import { runShopSubscriptionPull } from '../jobs/shop-subscription-pull.job';

const registeredTasks: Array<{ stop: () => void }> = [];
function registerJob(spec: JobSpec): void {
  registeredTasks.push(registerJobTracked(spec));
}

/**
 * Worker process entry point (§12.194, §12.244).
 *
 * Responsibilities:
 *   - Redis heartbeat every 5s (§12.141)
 *   - Escrow reconciliation every 60s (§12.244 job #3)
 *   - Health endpoint: GET /worker/health on port 3001
 *   - Graceful shutdown (60s stop_grace_period)
 */

const WORKER_PORT = 3001;
const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_TTL_SECONDS = 20;

// ---------------------------------------------------------------------------
// Redis heartbeat (§12.141)
// ---------------------------------------------------------------------------

let redis: Redis | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 1000,
    });
    redis.on('error', (err) => {
      logger.warn({ err }, 'Worker Redis background error');
    });
  }
  return redis;
}

async function sendHeartbeat(): Promise<void> {
  try {
    const r = getRedis();
    if (r.status === 'wait') {
      await r.connect();
    }
    await r.set('worker:heartbeat', String(Date.now()), 'EX', HEARTBEAT_TTL_SECONDS);
    updateHeartbeatTimestamp();
  } catch (err) {
    logger.warn({ err }, 'Failed to send worker heartbeat');
  }
}

// ---------------------------------------------------------------------------
// Cron jobs (§12.244)
// ---------------------------------------------------------------------------

let reconciliationRunning = false;
let providerHealthRunning = false;

async function runReconciliationSafe(): Promise<void> {
  if (reconciliationRunning) {
    return;
  }
  reconciliationRunning = true;
  try {
    await runReconciliation();
  } catch (err) {
    logger.error({ err }, 'Reconciliation job failed');
  } finally {
    reconciliationRunning = false;
  }
}

async function runProviderHealthSafe(): Promise<void> {
  if (providerHealthRunning) {
    return;
  }
  providerHealthRunning = true;
  try {
    const r = getRedis();
    if (r.status === 'wait') {
      await r.connect();
    }
    await runProviderHealth(r);
  } catch (err) {
    logger.error({ err }, 'Provider health job failed');
  } finally {
    providerHealthRunning = false;
  }
}

let toolQualityRunning = false;

async function runToolQualitySafe(): Promise<void> {
  if (toolQualityRunning) {
    return;
  }
  toolQualityRunning = true;
  try {
    const r = getRedis();
    if (r.status === 'wait') {
      await r.connect();
    }
    await runToolQuality(r);
  } catch (err) {
    logger.error({ err }, 'Tool quality job failed');
  } finally {
    toolQualityRunning = false;
  }
}

let x402HealthRunning = false;

async function runX402HealthSafe(): Promise<void> {
  if (x402HealthRunning) {
    return;
  }
  x402HealthRunning = true;
  try {
    const r = getRedis();
    if (r.status === 'wait') {
      await r.connect();
    }
    await runX402Health(r);
  } catch (err) {
    logger.error({ err }, 'x402 health job failed');
  } finally {
    x402HealthRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const healthServer = createHealthServer(WORKER_PORT);

// Start heartbeat
heartbeatTimer = setInterval(() => {
  sendHeartbeat().catch(() => {});
}, HEARTBEAT_INTERVAL_MS);
sendHeartbeat().catch(() => {});

// Schedule reconciliation every 60s (§12.244 job #3)
const reconciliationTask = cron.schedule('* * * * *', () => {
  runReconciliationSafe().catch(() => {});
});

// Schedule provider health checks every 2 min (round-robin, 1 provider per run)
const providerHealthTask = cron.schedule('*/2 * * * *', () => {
  runProviderHealthSafe().catch(() => {});
});

// Schedule x402 facilitator health check every hour (§12.244)
const x402HealthTask = cron.schedule('0 * * * *', () => {
  runX402HealthSafe().catch(() => {});
});

// Schedule tool quality index every 10 min (F5)
const toolQualityTask = cron.schedule('*/10 * * * *', () => {
  runToolQualitySafe().catch(() => {});
});

// Run tool quality once at startup after 15s delay
setTimeout(() => {
  runToolQualitySafe().catch(() => {});
}, 15_000);

// Run x402 health once at startup after 10s delay
setTimeout(() => {
  runX402HealthSafe().catch(() => {});
}, 10_000);

// Schedule partition creation daily at 23:00 UTC (§12.244 job #1)
async function runPartitionCreateSafe(): Promise<void> {
  try {
    await runPartitionCreate();
  } catch (err) {
    logger.error({ err, job: 'partition-create' }, 'Partition creation failed');
  }
}
const partitionCreateTask = cron.schedule('0 23 * * *', () => {
  runPartitionCreateSafe().catch(() => {});
});

// Schedule partition cleanup daily at 04:00 UTC (§12.244 job #2, per its own docstring).
// F1: this job existed with a green test but was never wired into any server.ts --
// moderation content ("deleted automatically" per /policy/moderation) never actually expired,
// outbox/execution_ledger/request_metrics partitions were created daily and never dropped.
let partitionCleanupRunning = false;
async function runPartitionCleanupSafe(): Promise<void> {
  if (partitionCleanupRunning) {
    return;
  }
  partitionCleanupRunning = true;
  try {
    await runPartitionCleanup();
  } catch (err) {
    logger.error({ err, job: 'partition-cleanup' }, 'Partition cleanup job failed');
  } finally {
    partitionCleanupRunning = false;
  }
}
const partitionCleanupTask = cron.schedule('0 4 * * *', () => {
  runPartitionCleanupSafe().catch(() => {});
});

// OFAC SDN -> shop_sanctioned_addresses daily at 05:30 UTC (F-13). Startup run (skipIfFresh)
// fills an empty table so registration sanctions checks are not a no-op until the first cron.
registerJob({
  name: 'ofac-sdn-sync',
  cron: '30 5 * * *',
  expect_every_s: 86400,
  run: () => runOfacSdnSync(),
});
setTimeout(
  () =>
    runOfacSdnSync({ skipIfFresh: true }).catch((err) =>
      logger.error({ err, job: 'ofac-sdn-sync' }, 'OFAC SDN sync job failed'),
    ),
  20_000,
);

// Order payments (INT-09, §7.2): pending/failed shop_payments are re-read on-chain every 60 s (T-0428);
// a daily sample of confirmed ones is re-checked against the receipt (PAYMENT_MISMATCH source).
registerJob({
  name: 'shop-payment-reconcile',
  cron: '* * * * *',
  expect_every_s: 60,
  run: () => runShopPaymentReconcile(),
});
// T-0428: unknown x402 settle outcomes (settlement_pending / facilitator timeout) are resolved by
// reading the chain every 60 s; this job never settles.
registerJob({
  name: 'x402-settle-pending',
  cron: '* * * * *',
  expect_every_s: 60,
  run: () => runX402SettlePending(),
});
// Order SLA sweeper (INT-12, §5.3): expired quotes, confirm_overdue, close_after, refund due_at,
// payout_pending, connect_events TTL, PII purge, fee overdue, payment identifiers.
registerJob({
  name: 'shop-sla-sweeper',
  cron: '*/5 * * * *',
  expect_every_s: 300,
  run: () => runShopSlaSweeper(),
});
// Fee invoices (INT-25, §7.1): the 1st of the month, owed Base receivables of the closed months -> one USDC invoice.
registerJob({
  name: 'shop-fee-invoice',
  cron: '10 3 1 * *',
  expect_every_s: 2678400,
  run: () => runShopFeeInvoice(),
});
// UC-22 IP country database (DB-IP Country Lite, published monthly): the 3rd of each month, 03:40 UTC.
registerJob({
  name: 'geo-db-refresh',
  cron: '40 3 3 * *',
  expect_every_s: 32 * 86400,
  run: () => runGeoDbRefresh(),
});
// Merchant domain proof (INT-15, UC-17): .well-known file or DNS TXT, once a day.
registerJob({
  name: 'shop-domain-verify',
  cron: '30 4 * * *',
  expect_every_s: 86400,
  run: () => runShopDomainVerify(),
});
// Provek registry sync (INT-44, §14): which opted-in merchants are listed at provek.dev, once a day.
registerJob({
  name: 'shop-provek-registry-sync',
  cron: '50 4 * * *',
  expect_every_s: 86400,
  run: () => runShopProvekRegistrySync(),
});
// Storefront probe (INT-16, §14): 100 random active /mcp/m/<slug> initialised in-process, hourly.
registerJob({
  name: 'shop-storefront-probe',
  cron: '7 * * * *',
  expect_every_s: 3600,
  run: () => runShopStorefrontProbe(),
});
// Catalog feed imports (INT-32, F-2): queued CSV / Google Merchant Center / Shopify imports, every minute.
registerJob({
  name: 'shop-catalog-import',
  cron: '* * * * *',
  expect_every_s: 60,
  run: async () => ({ count: await runShopCatalogImportJob() }),
});
// Layer-1 re-moderation when the rule files change (T-0315): hourly, no-op unless the rules hash differs.
let catalogRemoderateRunning = false;
const catalogRemoderateTask = cron.schedule('17 * * * *', () => {
  if (catalogRemoderateRunning) {
    return;
  }
  catalogRemoderateRunning = true;
  backfillContentHashes()
    .then(() => runCatalogRemoderate())
    .catch((err) =>
      logger.error({ err, job: 'catalog-remoderate' }, 'catalog remoderate job failed'),
    )
    .finally(() => {
      catalogRemoderateRunning = false;
    });
});
// T-0568: backfill content hashes once at start so reject memory is live right after deploy, not an hour later.
backfillContentHashes().catch((err) =>
  logger.error({ err, job: 'catalog-remoderate' }, 'content hash backfill at start failed'),
);
// Stream channel settlement (INT-40, F-9): $0.50 / hourly / payer-requested close, every minute.
registerJob({
  name: 'shop-stream-settle',
  cron: '* * * * *',
  expect_every_s: 60,
  run: () => runShopStreamSettle(),
});
// Subscription dunning (INT-41, UC-9): past_due at period end, notice at +24 h, canceled unpaid at +72 h.
registerJob({
  name: 'shop-subscription-sweep',
  cron: '*/5 * * * *',
  expect_every_s: 300,
  run: () => runShopSubscriptionSweep(),
});
// Pre-signed Base authorizations (INT-47, UC-9): executed hourly, each through the ordinary ESCROW -> settle path.
registerJob({
  name: 'shop-subscription-pull',
  cron: '0 * * * *',
  expect_every_s: 3600,
  run: () => runShopSubscriptionPull(),
});
registerJob({
  name: 'shop-payment-sample',
  cron: '15 6 * * *',
  expect_every_s: 86400,
  run: async () => ({ count: await runShopPaymentSample() }),
});

// Create partitions for next 7 days at startup (catch up after restart/missed crons)
setTimeout(async () => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    const tables = ['execution_ledger', 'outbox', 'request_metrics'];
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + dayOffset);
      d.setUTCHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + 1);
      const suffix = `${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, '0')}_${String(d.getUTCDate()).padStart(2, '0')}`;
      const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const to = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
      for (const table of tables) {
        await db
          .$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS "${table}_${suffix}" PARTITION OF "${table}" FOR VALUES FROM ('${from}') TO ('${to}')`,
          )
          .catch(() => {}); // ignore if already exists
      }
    }
    await db.$disconnect();
    logger.info(
      { job: 'partition-create', days: 8 },
      'Startup partition catch-up complete (today + 7 days)',
    );
  } catch (err) {
    logger.error({ err, job: 'partition-create' }, 'Startup partition catch-up failed');
  }
}, 5_000);

logger.info(workerStartedMessage());

// ---------------------------------------------------------------------------
// Graceful shutdown (§12.230 — 60s stop_grace_period)
// ---------------------------------------------------------------------------

function shutdown(signal: string): void {
  logger.info({ signal }, 'Worker shutdown signal received');

  reconciliationTask.stop();
  providerHealthTask.stop();
  x402HealthTask.stop();
  partitionCreateTask.stop();
  toolQualityTask.stop();
  partitionCleanupTask.stop();
  catalogRemoderateTask.stop();
  for (const task of registeredTasks) {
    task.stop();
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  healthServer.close(() => {
    if (redis) {
      redis.disconnect();
      redis = null;
    }
    logger.info('Worker shutdown complete');
    process.exit(0);
  });

  // Force exit after 58s (stop_grace_period is 60s, leave 2s buffer)
  setTimeout(() => {
    logger.warn('Worker graceful shutdown timeout — force exit');
    process.exit(1);
  }, 58_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
