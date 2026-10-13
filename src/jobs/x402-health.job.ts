import Redis from 'ioredis';
import { logger } from '../config/logger';
import { config } from '../config';
import { getCdpConfig } from '../config/cdp.config';
import { getX402Config } from '../config/x402.config';
import { buildCdpAuthHeadersFn } from '../services/cdp-jwt.service';
import { getOperatorWallet, weiToEth } from '../payments/operator-signer';
import { x402OperatorEthBalance } from '../services/metrics.service';
import { getMppConfig } from '../config/mpp.config';
import { getPrisma } from '../services/prisma.service';

/**
 * x402 Facilitator Health Check Job.
 *
 * Hourly probe of the x402 facilitator's /supported endpoint.
 * Verifies:
 *   1. Facilitator reachable (HTTP 2xx, <2s latency)
 *   2. Our network (eip155:8453) is in the supported list
 *   3. Config is not accidentally pointing to testnet
 *
 * Writes Redis hash x402:health (TTL 2h).
 */

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const REDIS_TTL = 7200; // 2 hours

type HealthStatus = 'green' | 'orange' | 'red';

interface X402HealthResult {
  status: HealthStatus;
  latency_ms: number;
  facilitator_url: string;
  network: string;
  network_supported: string;
  testnet: string;
  last_check: string;
}

export async function run(redis: Redis): Promise<void> {
  const chainId = await runFacilitatorProbe(redis);

  // CDP facilitator probe (independent, non-blocking)
  await runCdpHealthCheck(redis, chainId).catch((err) => {
    logger.warn({ err }, 'CDP health check threw — ignored');
  });

  // Operator wallet ETH balance probe (only when self-hosted facilitator is active).
  await runOperatorBalanceProbe(redis).catch((err) => {
    logger.warn({ err }, 'x402 operator balance probe threw — ignored');
  });

  // T-0177 (2026-09-23): recent x402 on-chain settle outcome, Telegram-independent.
  await runLocalSettleHealthCheck(redis).catch((err) => {
    logger.warn({ err }, 'x402 local settle health check threw — ignored');
  });

  // T-0372: Mode A (PG escrow) measured from ledger rows.
  await runModeAHealthCheck(redis).catch((err) => {
    logger.warn({ err }, 'Mode A health check threw — ignored');
  });

  // T-0372: MPP rail RPC probe.
  await runMppHealthCheck(redis).catch((err) => {
    logger.warn({ err }, 'MPP health check threw — ignored');
  });
}

async function runFacilitatorProbe(redis: Redis): Promise<string> {
  const facilitatorUrl = config.X402_FACILITATOR_URL;
  const networkEnv = config.X402_NETWORK;

  // Resolve network chain ID from env value
  const networkMap: Record<string, { chainId: string; testnet: boolean }> = {
    base: { chainId: 'eip155:8453', testnet: false },
    'base-sepolia': { chainId: 'eip155:84532', testnet: true },
  };
  const netInfo = networkMap[networkEnv] ?? networkMap['base-sepolia'];
  const chainId = netInfo.chainId;
  const isTestnet = netInfo.testnet;

  // Testnet in production = immediate red
  if (isTestnet && process.env.NODE_ENV === 'production') {
    const result: X402HealthResult = {
      status: 'red',
      latency_ms: 0,
      facilitator_url: facilitatorUrl,
      network: chainId,
      network_supported: 'false',
      testnet: 'true',
      last_check: new Date().toISOString(),
    };
    await writeRedis(redis, result);
    logger.warn(
      { job: 'x402-health', ...result },
      'x402 health: TESTNET config detected in production',
    );
    return chainId;
  }

  // Probe facilitator /supported endpoint
  const supportedUrl = `${facilitatorUrl.replace(/\/+$/, '')}/supported`;
  const start = performance.now();

  try {
    const response = await fetch(supportedUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      headers: {
        'User-Agent': 'APIbase-x402-HealthCheck/1.0',
        Accept: 'application/json',
      },
    });
    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      const result: X402HealthResult = {
        status: 'red',
        latency_ms: latencyMs,
        facilitator_url: facilitatorUrl,
        network: chainId,
        network_supported: 'false',
        testnet: String(isTestnet),
        last_check: new Date().toISOString(),
      };
      await writeRedis(redis, result);
      logger.warn(
        { job: 'x402-health', http_status: response.status, latency_ms: latencyMs },
        'x402 health: facilitator returned non-2xx',
      );
      return chainId;
    }

    // Parse supported chains/assets
    let networkSupported = false;
    try {
      const body = (await response.json()) as unknown;
      networkSupported = checkNetworkSupported(body, chainId);
    } catch {
      // Could not parse — treat as orange (reachable but can't verify)
    }

    let status: HealthStatus;
    if (latencyMs <= 2000 && networkSupported) {
      status = 'green';
    } else if (!networkSupported) {
      status = 'orange';
    } else {
      status = 'orange'; // slow
    }

    const result: X402HealthResult = {
      status,
      latency_ms: latencyMs,
      facilitator_url: facilitatorUrl,
      network: chainId,
      network_supported: String(networkSupported),
      testnet: String(isTestnet),
      last_check: new Date().toISOString(),
    };
    await writeRedis(redis, result);

    logger.info(
      {
        job: 'x402-health',
        status,
        latency_ms: latencyMs,
        network: chainId,
        network_supported: networkSupported,
      },
      'x402 health check completed',
    );
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const result: X402HealthResult = {
      status: 'red',
      latency_ms: latencyMs,
      facilitator_url: facilitatorUrl,
      network: chainId,
      network_supported: 'false',
      testnet: String(isTestnet),
      last_check: new Date().toISOString(),
    };
    await writeRedis(redis, result);
    logger.warn({ job: 'x402-health', err, latency_ms: latencyMs }, 'x402 health check failed');
  }
  return chainId;
}

/**
 * Local settle health probe (T-0177).
 * Counts execution_ledger.x402_onchain_settled outcomes over the trailing
 * window and writes Redis hash x402:local_settle (TTL 2h) for the dashboard
 * (see src/services/dashboard.service.ts) — a single query run once an hour
 * from this job, not on every dashboard request. Exists because the
 * Prometheus alert covering the same condition (#29 X402LocalSettleErrorRate)
 * routes to Telegram, which is paused; this makes "100% of settles are
 * failing" visible without depending on that channel.
 */
const LOCAL_SETTLE_WINDOW_MINUTES = 30;

async function runLocalSettleHealthCheck(redis: Redis): Promise<void> {
  // NOT_CHARGED rows never attempted a settle (T-0338); 0371 writes NULL for new rows,
  // this guard covers rows written before it.
  const rows = await getPrisma().$queryRawUnsafe<Array<{ successes: bigint; failures: bigint }>>(`
    SELECT
      COUNT(*) FILTER (WHERE x402_onchain_settled = true) AS successes,
      COUNT(*) FILTER (WHERE x402_onchain_settled = false) AS failures
    FROM execution_ledger
    WHERE created_at >= NOW() - INTERVAL '${LOCAL_SETTLE_WINDOW_MINUTES} minutes'
      AND x402_onchain_settled IS NOT NULL
      AND billing_status = 'PAID'
  `);
  const successes = Number(rows[0]?.successes ?? 0);
  const failures = Number(rows[0]?.failures ?? 0);
  const status = failures > 0 ? (successes > 0 ? 'orange' : 'red') : 'green';

  try {
    await redis.hmset('x402:local_settle', {
      successes: String(successes),
      failures: String(failures),
      window_minutes: String(LOCAL_SETTLE_WINDOW_MINUTES),
      status,
      last_check: new Date().toISOString(),
    });
    await redis.expire('x402:local_settle', REDIS_TTL);
  } catch (err) {
    logger.warn({ err }, 'Failed to write x402 local settle health to Redis');
  }

  logger.info(
    { job: 'x402-health', successes, failures, status },
    'x402 local settle health check completed',
  );
}

export type RailStatus = 'green' | 'orange' | 'red' | 'n/a';

/**
 * Mode A status from pre-funded escrow rows in the window (T-0372).
 * A RESERVED row older than 3 minutes means finalize AND the reconciliation
 * reaper (refunds stalled RESERVED after 60-120 s) both failed.
 */
export function modeAStatus(paid: number, refunded: number, stuck: number): RailStatus {
  if (stuck > 0) return 'red';
  if (paid > 0) return 'green';
  if (refunded > 0) return 'orange';
  return 'n/a';
}

async function runModeAHealthCheck(redis: Redis): Promise<void> {
  // Escrow rows are the ones with no payer and no on-chain settle flag
  // (escrow.service.ts writes no payer; x402 and MPP paths always set it).
  const rows = await getPrisma().$queryRawUnsafe<
    Array<{ paid: bigint; refunded: bigint; stuck: bigint }>
  >(`
    SELECT
      COUNT(*) FILTER (WHERE billing_status = 'PAID') AS paid,
      COUNT(*) FILTER (WHERE billing_status = 'REFUNDED') AS refunded,
      COUNT(*) FILTER (WHERE billing_status = 'RESERVED'
                       AND created_at < NOW() - INTERVAL '3 minutes') AS stuck
    FROM execution_ledger
    WHERE created_at >= NOW() - INTERVAL '${LOCAL_SETTLE_WINDOW_MINUTES} minutes'
      AND payer IS NULL AND x402_onchain_settled IS NULL
      AND billing_status IN ('PAID','REFUNDED','RESERVED')
  `);
  const paid = Number(rows[0]?.paid ?? 0);
  const refunded = Number(rows[0]?.refunded ?? 0);
  const stuck = Number(rows[0]?.stuck ?? 0);
  const status = modeAStatus(paid, refunded, stuck);

  try {
    await redis.hmset('payment:mode_a', {
      paid: String(paid),
      refunded: String(refunded),
      stuck: String(stuck),
      window_minutes: String(LOCAL_SETTLE_WINDOW_MINUTES),
      status,
      last_check: new Date().toISOString(),
    });
    await redis.expire('payment:mode_a', REDIS_TTL);
  } catch (err) {
    logger.warn({ err }, 'Failed to write Mode A health to Redis');
  }

  logger.info(
    { job: 'x402-health', paid, refunded, stuck, status },
    'Mode A health check completed',
  );
}

export interface MppStatusInput {
  testnet: boolean;
  isProduction: boolean;
  fetchFailed: boolean;
  httpOk: boolean;
  chainId: number | null;
  expectedChainId: number;
  latencyMs: number;
}

export function mppStatus(input: MppStatusInput): HealthStatus {
  if (input.testnet && input.isProduction) return 'red';
  if (input.fetchFailed || !input.httpOk) return 'red';
  if (input.chainId !== input.expectedChainId) return 'orange';
  if (input.latencyMs > 2000) return 'orange';
  return 'green';
}

async function runMppHealthCheck(redis: Redis): Promise<void> {
  const cfg = getMppConfig();
  const now = new Date().toISOString();

  if (!cfg.enabled) {
    try {
      await redis.hmset('mpp:health', { status: 'n/a', reason: 'disabled', last_check: now });
      await redis.expire('mpp:health', REDIS_TTL);
    } catch (err) {
      logger.warn({ err }, 'Failed to write MPP health to Redis');
    }
    return;
  }

  const start = performance.now();
  let fetchFailed = false;
  let httpOk = false;
  let chainId: number | null = null;

  try {
    const response = await fetch(cfg.rpcUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      headers: {
        'User-Agent': 'APIbase-mpp-HealthCheck/1.0',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    });
    httpOk = response.ok;
    if (httpOk) {
      try {
        const body = (await response.json()) as { result?: unknown };
        if (typeof body?.result === 'string') {
          const n = Number(body.result);
          chainId = Number.isFinite(n) ? n : null;
        }
      } catch {
        // unparseable body: chainId stays null, status orange
      }
    }
  } catch (err) {
    fetchFailed = true;
    logger.warn({ job: 'x402-health', err }, 'MPP health check: RPC call failed');
  }
  const latencyMs = Math.round(performance.now() - start);

  const status = mppStatus({
    testnet: cfg.testnet,
    isProduction: process.env.NODE_ENV === 'production',
    fetchFailed,
    httpOk,
    chainId,
    expectedChainId: cfg.chainId,
    latencyMs,
  });

  try {
    await redis.hmset('mpp:health', {
      status,
      latency_ms: String(latencyMs),
      rpc_url: cfg.rpcUrl,
      network: 'eip155:' + cfg.chainId,
      network_supported: String(chainId === cfg.chainId),
      testnet: String(cfg.testnet),
      last_check: now,
    });
    await redis.expire('mpp:health', REDIS_TTL);
  } catch (err) {
    logger.warn({ err }, 'Failed to write MPP health to Redis');
  }

  logger.info({ job: 'x402-health', status, latency_ms: latencyMs }, 'MPP health check completed');
}

/**
 * Operator wallet ETH balance probe.
 * Updates the x402_operator_eth_balance gauge so Prometheus alert
 * X402OperatorWalletLowBalance can fire before settles start failing.
 * Also writes Redis hash x402:operator (TTL 2h) for the dashboard.
 */
async function runOperatorBalanceProbe(redis: Redis): Promise<void> {
  const x402Cfg = getX402Config();
  if (x402Cfg.facilitatorMode !== 'local') return;

  let wallet;
  try {
    wallet = getOperatorWallet();
  } catch (err) {
    logger.warn({ err }, 'x402 operator wallet not initialized — skipping balance probe');
    return;
  }

  let balanceWei: bigint;
  try {
    balanceWei = await wallet.getEthBalance();
  } catch (err) {
    logger.warn({ err, operator: wallet.address }, 'x402 operator balance probe: RPC call failed');
    return;
  }

  const balanceEth = weiToEth(balanceWei);
  x402OperatorEthBalance.set(balanceEth);

  try {
    await redis.hmset('x402:operator', {
      address: wallet.address,
      balance_eth: String(balanceEth),
      min_balance_eth: String(x402Cfg.operatorMinEthBalance),
      warn_balance_eth: String(3 * x402Cfg.operatorMinEthBalance),
      tier:
        balanceEth < x402Cfg.operatorMinEthBalance
          ? 'red'
          : balanceEth < 3 * x402Cfg.operatorMinEthBalance
            ? 'orange'
            : 'green',
      below_threshold: String(balanceEth < x402Cfg.operatorMinEthBalance),
      last_check: new Date().toISOString(),
    });
    await redis.expire('x402:operator', 7200);
  } catch (err) {
    logger.warn({ err }, 'Failed to write x402 operator balance to Redis');
  }

  logger.info(
    {
      job: 'x402-health',
      operator: wallet.address,
      balance_eth: balanceEth,
      min_eth: x402Cfg.operatorMinEthBalance,
    },
    'x402 operator balance probe completed',
  );
}

// Map chain IDs to short names used by facilitators
const CHAIN_SHORT_NAMES: Record<string, string> = {
  'eip155:8453': 'base',
  'eip155:84532': 'base-sepolia',
};

function checkNetworkSupported(body: unknown, chainId: string): boolean {
  const shortName = CHAIN_SHORT_NAMES[chainId] || chainId;

  // Facilitator /supported returns { kinds: [{ network: "base", scheme: "exact", x402Version: 1 }] }
  if (typeof body === 'object' && body !== null) {
    const obj = body as Record<string, unknown>;
    // PayAI / RelAI format: { kinds: [...] }
    if (Array.isArray(obj.kinds)) {
      return (obj.kinds as Array<Record<string, unknown>>).some(
        (k) => String(k.network) === chainId || String(k.network) === shortName,
      );
    }
    // Direct array at root
    if (Array.isArray(obj)) {
      return (obj as Array<Record<string, unknown>>).some(
        (k) => String(k.network) === chainId || String(k.network) === shortName,
      );
    }
    // Check for chainId as key
    if (chainId in obj || shortName in obj) return true;
  }
  // Root-level array
  if (Array.isArray(body)) {
    return body.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const obj = entry as Record<string, unknown>;
        const netVal = String(obj.network || obj.chain || obj.chainId || '');
        return netVal === chainId || netVal === shortName;
      }
      const s = String(entry);
      return s === chainId || s === shortName;
    });
  }
  return false;
}

/**
 * CDP facilitator health probe (runs after PayAI probe).
 * Writes to separate Redis key x402:health:cdp.
 */
async function runCdpHealthCheck(redis: Redis, chainId: string): Promise<void> {
  const cdpCfg = getCdpConfig();
  if (!cdpCfg.enabled) return;

  const supportedUrl = `${cdpCfg.facilitatorUrl.replace(/\/+$/, '')}/supported`;
  const start = performance.now();

  try {
    const authFn = buildCdpAuthHeadersFn(cdpCfg.apiKeyId, cdpCfg.apiKeySecret);
    const authHeaders = await authFn();
    const headers: Record<string, string> = {
      'User-Agent': 'APIbase-x402-HealthCheck/1.0',
      Accept: 'application/json',
      ...(authHeaders.supported ?? {}),
    };

    const response = await fetch(supportedUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      headers,
    });
    const latencyMs = Math.round(performance.now() - start);

    let status: HealthStatus = 'red';
    let networkSupported = false;

    if (response.ok) {
      try {
        const body = (await response.json()) as unknown;
        networkSupported = checkNetworkSupported(body, chainId);
      } catch {
        /* parse fail = orange */
      }
      status = latencyMs <= 2000 && networkSupported ? 'green' : 'orange';
    }

    const result: X402HealthResult = {
      status,
      latency_ms: latencyMs,
      facilitator_url: cdpCfg.facilitatorUrl,
      network: chainId,
      network_supported: String(networkSupported),
      testnet: 'false',
      last_check: new Date().toISOString(),
    };

    await writeRedis(redis, result, 'x402:health:cdp');
    logger.info(
      { job: 'x402-health', facilitator: 'cdp', status, latency_ms: latencyMs },
      'CDP health check completed',
    );
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const result: X402HealthResult = {
      status: 'red',
      latency_ms: latencyMs,
      facilitator_url: cdpCfg.facilitatorUrl,
      network: chainId,
      network_supported: 'false',
      testnet: 'false',
      last_check: new Date().toISOString(),
    };
    await writeRedis(redis, result, 'x402:health:cdp');
    logger.warn(
      { job: 'x402-health', facilitator: 'cdp', err, latency_ms: latencyMs },
      'CDP health check failed',
    );
  }
}

async function writeRedis(
  redis: Redis,
  result: X402HealthResult,
  key = 'x402:health',
): Promise<void> {
  try {
    await redis.hmset(key, {
      status: result.status,
      latency_ms: String(result.latency_ms),
      facilitator_url: result.facilitator_url,
      network: result.network,
      network_supported: result.network_supported,
      testnet: result.testnet,
      last_check: result.last_check,
    });
    await redis.expire(key, REDIS_TTL);
  } catch (err) {
    logger.warn({ err }, 'Failed to write x402 health to Redis');
  }
}
