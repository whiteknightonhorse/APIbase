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

/** Replace every configured RPC URL (and its path, which may carry a key) with its host. */
function scrub(text: unknown, urls: readonly string[]): unknown {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const u of urls) {
    if (!u) continue;
    out = out.split(u).join(rpcHost(u));
    try {
      const parsed = new URL(u);
      const tail = parsed.pathname + parsed.search;
      if (tail.length > 1) out = out.split(tail).join('');
    } catch {
      /* not a URL: nothing more to scrub */
    }
  }
  return out;
}

function scrubError(err: unknown, urls: readonly string[], depth = 0): void {
  if (typeof err !== 'object' || err === null || depth > 5) return;
  const e = err as Record<string, unknown>;
  for (const k of ['message', 'shortMessage', 'details']) {
    if (typeof e[k] === 'string') {
      try {
        e[k] = scrub(e[k], urls);
      } catch {
        /* read-only property */
      }
    }
  }
  if (Array.isArray(e.metaMessages)) {
    try {
      e.metaMessages = e.metaMessages.map((m) => scrub(m, urls));
    } catch {
      /* read-only property */
    }
  }
  if (typeof e.url === 'string') {
    try {
      e.url = scrub(e.url, urls);
    } catch {
      /* read-only property */
    }
  }
  scrubError(e.cause, urls, depth + 1);
}

/** Wrap a transport so errors it throws never carry a configured RPC URL (T-0642 R4). */
function sanitized(t: Transport, urls: readonly string[]): Transport {
  return ((args) => {
    const inner = t(args);
    const req = inner.request;
    return {
      ...inner,
      request: async (...a: Parameters<typeof req>) => {
        try {
          return await req(...a);
        } catch (err) {
          scrubError(err, urls);
          throw err;
        }
      },
    };
  }) as Transport;
}

export function baseTransport(cfg: BaseTransportConfig): Transport {
  const [primary, reserve] = cfg.baseRpcUrls;
  if (!reserve) {
    return sanitized(
      http(primary, { retryCount: 2, retryDelay: 200, timeout: 10_000 }),
      cfg.baseRpcUrls,
    );
  }
  const inner = fallback(
    [
      http(primary, { retryCount: 2, retryDelay: 200, timeout: 10_000 }),
      http(reserve, { retryCount: 1, timeout: 10_000 }),
    ],
    { rank: false, retryCount: 0 },
  );
  const withMetric = ((args) => {
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
  return sanitized(withMetric, cfg.baseRpcUrls);
}
