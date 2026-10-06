import { request } from 'node:https';
import { logger } from '../config/logger';
import { provekRegistrySyncFailures } from '../services/metrics.service';
import type { ShopTx } from '../shop/db';
import { defaultShopDeps } from '../shop/merchant-lifecycle.service';
import { PROVEK_REGISTRY_URL } from '../shop/provek/provek.service';
import { defaultResolver, resolvePublicTarget, type HostResolver } from '../shop/webhook/ssrf';

/** §8.5 outbound GET of the Provek registry: public address, no redirects, bounded time and size. */
export const REGISTRY_TIMEOUT_MS = 20_000;
export const REGISTRY_MAX_BYTES = 10 * 1024 * 1024;

export type FetchRegistry = (target: {
  host: string;
  ip: string;
  path: string;
  timeoutMs: number;
  maxBytes: number;
}) => Promise<{ status: number; body: string; oversize?: boolean }>;

export interface ProvekSyncDeps {
  db: ShopTx;
  resolve?: HostResolver;
  fetchRegistry?: FetchRegistry;
}

const httpsGet: FetchRegistry = ({ host, ip, path, timeoutMs, maxBytes }) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const req = request(
      {
        host: ip,
        servername: host,
        port: 443,
        path,
        method: 'GET',
        headers: { Host: host, Accept: 'application/json', 'User-Agent': 'APIbase-ProvekSync/1' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            finish(() => resolve({ status: res.statusCode ?? 0, body: '', oversize: true }));
            res.destroy();
          } else chunks.push(c);
        });
        res.on('end', () =>
          finish(() =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
          ),
        );
        res.on('error', (e) => finish(() => reject(e)));
        res.on('close', () => finish(() => reject(new Error('connection closed early'))));
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.on('error', (e) => finish(() => reject(e)));
    req.end();
  });

const hostOf = (v: string): string | null => {
  const s = v.trim();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  try {
    const h = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname;
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h) ? h.toLowerCase().replace(/^www\./, '') : null;
  } catch {
    return null;
  }
};

const ENTRY_URL_KEYS = ['registry_url', 'entry_url', 'page_url'];
const DOMAIN_KEY_RE = /(domain|host|site|website|url)$/i;

/**
 * The registry layout is read leniently: every object (at any depth) whose string fields named
 * like a domain / site / url yield a host, and the entry's own page URL is kept when it has one.
 */
export function parseRegistry(json: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1);
      return;
    }
    const o = node as Record<string, unknown>;
    let entryUrl: string | undefined;
    for (const k of ENTRY_URL_KEYS) {
      const v = o[k];
      if (typeof v === 'string' && /^https:\/\/provek\.dev\//.test(v) && v.length <= 500) {
        entryUrl = v;
        break;
      }
    }
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && DOMAIN_KEY_RE.test(k) && !ENTRY_URL_KEYS.includes(k)) {
        const h = hostOf(v);
        if (h && !out.has(h)) out.set(h, entryUrl ?? PROVEK_REGISTRY_URL);
      } else walk(v, depth + 1);
    }
  };
  walk(json, 0);
  return out;
}

export async function loadRegistry(
  deps: Pick<ProvekSyncDeps, 'resolve' | 'fetchRegistry'>,
): Promise<Map<string, string>> {
  const target = await resolvePublicTarget(PROVEK_REGISTRY_URL, deps.resolve ?? defaultResolver);
  const r = await (deps.fetchRegistry ?? httpsGet)({
    host: target.url.host,
    ip: target.ip,
    path: target.url.pathname,
    timeoutMs: REGISTRY_TIMEOUT_MS,
    maxBytes: REGISTRY_MAX_BYTES,
  });
  // a 3xx is never followed
  if (r.status !== 200) throw new Error(`registry answered HTTP ${r.status}`);
  if (r.oversize || Buffer.byteLength(r.body) > REGISTRY_MAX_BYTES) {
    throw new Error('registry is larger than 10 MB');
  }
  return parseRegistry(JSON.parse(r.body));
}

/**
 * `shop-provek-registry-sync` (daily, worker): for merchants that opted in, `listed` = the host of
 * `site_url` is in the registry. Any load failure leaves every stored value as it was.
 */
export async function runShopProvekRegistrySync(
  deps: ProvekSyncDeps = { db: defaultShopDeps().db },
): Promise<{ checked: number; listed: number; failed: boolean }> {
  let registry: Map<string, string>;
  try {
    registry = await loadRegistry(deps);
  } catch (err) {
    provekRegistrySyncFailures.inc();
    logger.warn({ err, job: 'shop-provek-registry-sync' }, 'provek registry load failed');
    return { checked: 0, listed: 0, failed: true };
  }
  const rows = await deps.db.$queryRawUnsafe<
    Array<{ merchant_id: string; site_url: string; provek: Record<string, unknown> }>
  >(
    `SELECT merchant_id, site_url, provek FROM shop_merchants
      WHERE provek->>'opt_in' = 'true' AND status IN ('pending', 'active')`,
  );
  let listed = 0;
  for (const m of rows) {
    const host = hostOf(m.site_url);
    const url = host ? registry.get(host) : undefined;
    if (url) listed++;
    const next = { ...m.provek, listed: Boolean(url), registry_url: url ?? null };
    if (
      next.listed === (m.provek.listed === true) &&
      next.registry_url === (m.provek.registry_url ?? null)
    ) {
      continue;
    }
    try {
      await deps.db.$executeRawUnsafe(
        `UPDATE shop_merchants SET provek = $2::jsonb
          WHERE merchant_id = $1::uuid AND provek->>'opt_in' = 'true'`,
        m.merchant_id,
        JSON.stringify(next),
      );
    } catch (err) {
      logger.error({ err, job: 'shop-provek-registry-sync' }, 'provek registry update failed');
    }
  }
  return { checked: rows.length, listed, failed: false };
}
