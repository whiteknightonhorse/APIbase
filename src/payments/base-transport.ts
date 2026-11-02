/**
 * Base RPC transport (T-0642).
 *
 * Primary public RPC first; when X402_BASE_RPC_URL_FALLBACK is set, a viem fallback transport
 * serves a request on the reserve host after the primary failed. Only the hostname is ever
 * logged or used as a metric label: reserve URLs may carry an API key in the path.
 */
import { fallback, http, type Transport } from 'viem';
import { logger } from '../config/logger';
import { x402RpcFallbackUsedTotal } from '../services/metrics.service';

export interface BaseTransportConfig {
  readonly baseRpcUrls: readonly string[];
}

const LOG_INTERVAL_MS = 60_000;
let lastLogAt = 0;

export function rpcHost(url: unknown): string {
  if (typeof url !== 'string') return 'unknown';
  try {
    return new URL(url).host;
  } catch {
    return 'unknown';
  }
}

/** Test seam: reset the once-per-minute log throttle. */
export function resetBaseTransportLogThrottle(): void {
  lastLogAt = 0;
}

function noteFallbackUsed(url: unknown): void {
  const host = rpcHost(url);
  x402RpcFallbackUsedTotal.inc({ host });
  const now = Date.now();
  if (now - lastLogAt >= LOG_INTERVAL_MS) {
    lastLogAt = now;
    logger.warn({ host }, `x402 rpc: primary failed, fallback ${host} used`);
  }
}

export function baseTransport(cfg: BaseTransportConfig): Transport {
  const [primary, reserve] = cfg.baseRpcUrls;
  if (!reserve) {
    return http(primary, { retryCount: 2, retryDelay: 200, timeout: 10_000 });
  }
  const inner = fallback(
    [
      http(primary, { retryCount: 2, retryDelay: 200, timeout: 10_000 }),
      http(reserve, { retryCount: 1, timeout: 10_000 }),
    ],
    { rank: false, retryCount: 0 },
  );
  return ((args) => {
    const t = inner(args);
    const value = t.value as {
      onResponse?: (
        fn: (r: { status: string; transport: { value?: { url?: string } } }) => void,
      ) => void;
    };
    value.onResponse?.((r) => {
      if (r.status === 'success' && r.transport?.value?.url === reserve) {
        noteFallbackUsed(reserve);
      }
    });
    return t;
  }) as Transport;
}
