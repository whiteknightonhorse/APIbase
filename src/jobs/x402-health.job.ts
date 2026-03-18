import Redis from 'ioredis';
import { logger } from '../config/logger';
import { config } from '../config';

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
    logger.warn({ job: 'x402-health', ...result }, 'x402 health: TESTNET config detected in production');
    return;
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
      logger.warn({ job: 'x402-health', http_status: response.status, latency_ms: latencyMs }, 'x402 health: facilitator returned non-2xx');
      return;
    }

    // Parse supported chains/assets
    let networkSupported = false;
    try {
      const body = await response.json() as unknown;
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

    logger.info({
      job: 'x402-health',
      status,
      latency_ms: latencyMs,
      network: chainId,
      network_supported: networkSupported,
    }, 'x402 health check completed');
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

async function writeRedis(redis: Redis, result: X402HealthResult): Promise<void> {
  try {
    await redis.hmset('x402:health', {
      status: result.status,
      latency_ms: String(result.latency_ms),
      facilitator_url: result.facilitator_url,
      network: result.network,
      network_supported: result.network_supported,
      testnet: result.testnet,
      last_check: result.last_check,
    });
    await redis.expire('x402:health', REDIS_TTL);
  } catch (err) {
    logger.warn({ err }, 'Failed to write x402 health to Redis');
  }
}
