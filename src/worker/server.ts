import Redis from 'ioredis';
import cron from 'node-cron';
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
import { runShopFeeInvoice } from '../jobs/shop-fee-invoice.job';
import { runShopSlaSweeper } from '../jobs/shop-sla-sweeper.job';
import { runShopDomainVerify } from '../jobs/shop-domain-verify.job';
import { runShopProvekRegistrySync } from '../jobs/shop-provek-registry-sync.job';
import { runShopStorefrontProbe } from '../jobs/shop-storefront-probe.job';
import { runShopCatalogImportJob } from '../jobs/shop-catalog-import.job';
import { runShopStreamSettle } from '../jobs/shop-stream-settle.job';
import { runShopSubscriptionSweep } from '../jobs/shop-subscription-sweep.job';
import { runShopSubscriptionPull } from '../jobs/shop-subscription-pull.job';

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
let ofacSdnSyncRunning = false;
async function runOfacSdnSyncSafe(opts?: { skipIfFresh?: boolean }): Promise<void> {
  if (ofacSdnSyncRunning) {
    return;
  }
  ofacSdnSyncRunning = true;
  try {
    await runOfacSdnSync(opts);
  } catch (err) {
    logger.error({ err, job: 'ofac-sdn-sync' }, 'OFAC SDN sync job failed');
  } finally {
    ofacSdnSyncRunning = false;
  }
}
const ofacSdnSyncTask = cron.schedule('30 5 * * *', () => {
  runOfacSdnSyncSafe().catch(() => {});
});
setTimeout(() => runOfacSdnSyncSafe({ skipIfFresh: true }).catch(() => {}), 20_000);

// Order payments (INT-09, §7.2): pending/failed shop_payments are re-read on-chain every 5 min;
// a daily sample of confirmed ones is re-checked against the receipt (PAYMENT_MISMATCH source).
let shopReconcileRunning = false;
const shopReconcileTask = cron.schedule('*/5 * * * *', () => {
  if (shopReconcileRunning) {
    return;
  }
  shopReconcileRunning = true;
  runShopPaymentReconcile()
    .catch((err) => logger.error({ err, job: 'shop-payment-reconcile' }, 'reconcile job failed'))
    .finally(() => {
      shopReconcileRunning = false;
    });
});
// Order SLA sweeper (INT-12, §5.3): expired quotes, confirm_overdue, close_after, refund due_at,
// payout_pending, connect_events TTL.
let shopSweeperRunning = false;
const shopSweeperTask = cron.schedule('*/5 * * * *', () => {
  if (shopSweeperRunning) {
    return;
  }
  shopSweeperRunning = true;
  runShopSlaSweeper()
    .catch((err) => logger.error({ err, job: 'shop-sla-sweeper' }, 'sweeper job failed'))
    .finally(() => {
      shopSweeperRunning = false;
    });
});
// Fee invoices (INT-25, §7.1): the 1st of the month, owed Base receivables of the closed months -> one USDC invoice.
const shopFeeInvoiceTask = cron.schedule('10 3 1 * *', () => {
  runShopFeeInvoice().catch((err) =>
    logger.error({ err, job: 'shop-fee-invoice' }, 'fee invoice job failed'),
  );
});
// Merchant domain proof (INT-15, UC-17): .well-known file or DNS TXT, once a day.
const shopDomainVerifyTask = cron.schedule('30 4 * * *', () => {
  runShopDomainVerify().catch((err) =>
    logger.error({ err, job: 'shop-domain-verify' }, 'domain verify job failed'),
  );
});
// Provek registry sync (INT-44, §14): which opted-in merchants are listed at provek.dev, once a day.
const shopProvekSyncTask = cron.schedule('50 4 * * *', () => {
  runShopProvekRegistrySync().catch((err) =>
    logger.error({ err, job: 'shop-provek-registry-sync' }, 'provek registry sync job failed'),
  );
});
// Storefront probe (INT-16, §14): 100 random active /mcp/m/<slug> initialised in-process, hourly.
const shopStorefrontProbeTask = cron.schedule('7 * * * *', () => {
  runShopStorefrontProbe().catch((err) =>
    logger.error({ err, job: 'shop-storefront-probe' }, 'storefront probe job failed'),
  );
});
// Catalog feed imports (INT-32, F-2): queued CSV / Google Merchant Center / Shopify imports, every minute.
let shopCatalogImportRunning = false;
const shopCatalogImportTask = cron.schedule('* * * * *', () => {
  if (shopCatalogImportRunning) {
    return;
  }
  shopCatalogImportRunning = true;
  runShopCatalogImportJob()
    .catch((err) => logger.error({ err, job: 'shop-catalog-import' }, 'catalog import job failed'))
    .finally(() => {
      shopCatalogImportRunning = false;
    });
});
// Stream channel settlement (INT-40, F-9): $0.50 / hourly / payer-requested close, every minute.
let shopStreamSettleRunning = false;
const shopStreamSettleTask = cron.schedule('* * * * *', () => {
  if (shopStreamSettleRunning) {
    return;
  }
  shopStreamSettleRunning = true;
  runShopStreamSettle()
    .catch((err) => logger.error({ err, job: 'shop-stream-settle' }, 'stream settle job failed'))
    .finally(() => {
      shopStreamSettleRunning = false;
    });
});
// Subscription dunning (INT-41, UC-9): past_due at period end, notice at +24 h, canceled unpaid at +72 h.
let shopSubscriptionSweepRunning = false;
const shopSubscriptionSweepTask = cron.schedule('*/5 * * * *', () => {
  if (shopSubscriptionSweepRunning) {
    return;
  }
  shopSubscriptionSweepRunning = true;
  runShopSubscriptionSweep()
    .catch((err) =>
      logger.error({ err, job: 'shop-subscription-sweep' }, 'subscription sweep job failed'),
    )
    .finally(() => {
      shopSubscriptionSweepRunning = false;
    });
});
// Pre-signed Base authorizations (INT-47, UC-9): executed hourly, each through the ordinary ESCROW -> settle path.
let shopSubscriptionPullRunning = false;
const shopSubscriptionPullTask = cron.schedule('0 * * * *', () => {
  if (shopSubscriptionPullRunning) {
    return;
  }
  shopSubscriptionPullRunning = true;
  runShopSubscriptionPull()
    .catch((err) =>
      logger.error({ err, job: 'shop-subscription-pull' }, 'subscription pull job failed'),
    )
    .finally(() => {
      shopSubscriptionPullRunning = false;
    });
});
const shopPaymentSampleTask = cron.schedule('15 6 * * *', () => {
  runShopPaymentSample().catch((err) =>
    logger.error({ err, job: 'shop-payment-sample' }, 'daily payment sample failed'),
  );
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

logger.info(
  'Worker started — heartbeat + reconciliation + provider-health + x402-health + partition-create + partition-cleanup + ofac-sdn-sync + shop-payment-reconcile + shop-sla-sweeper + shop-fee-invoice cron active',
);

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
  ofacSdnSyncTask.stop();
  shopReconcileTask.stop();
  shopSweeperTask.stop();
  shopFeeInvoiceTask.stop();
  shopDomainVerifyTask.stop();
  shopProvekSyncTask.stop();
  shopStorefrontProbeTask.stop();
  shopCatalogImportTask.stop();
  shopStreamSettleTask.stop();
  shopSubscriptionSweepTask.stop();
  shopSubscriptionPullTask.stop();
  shopPaymentSampleTask.stop();

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
