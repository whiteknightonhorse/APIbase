import { resolveTxt } from 'node:dns/promises';
import { request } from 'node:https';
import { logger } from '../config/logger';
import type { ShopTx } from '../shop/db';
import { defaultShopDeps } from '../shop/merchant-lifecycle.service';
import { defaultResolver, resolvePublicTarget, type HostResolver } from '../shop/webhook/ssrf';

/** UC-17: control of the merchant's `site_url` host is proven by a file or a DNS TXT record. */
export const WELL_KNOWN_PATH = '/.well-known/apibase-merchant.txt';
export const DOMAIN_FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 4096;

export type TxtResolver = (host: string) => Promise<string[][]>;
export type FetchWellKnown = (target: {
  host: string;
  ip: string;
  path: string;
  timeoutMs: number;
}) => Promise<{ status: number; body: string }>;

export interface DomainVerifyDeps {
  db: ShopTx;
  resolve?: HostResolver;
  resolveTxt?: TxtResolver;
  fetchWellKnown?: FetchWellKnown;
}

/** §8.5 outbound GET: TLS to the pinned public address, no redirects, bounded time and size. */
const httpsGet: FetchWellKnown = ({ host, ip, path, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const req = request(
      { host: ip, servername: host, port: 443, path, method: 'GET', headers: { Host: host } },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size <= MAX_BODY_BYTES) chunks.push(c);
          else res.destroy();
        });
        res.on('end', done);
        res.on('close', done);
        res.on('error', done);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.on('close', () => clearTimeout(timer));
    req.end();
  });

/** True when the host proves `slug` by file (HTTP 200, a line equal to the slug) or TXT `apibase-merchant=<slug>`. */
export async function checkDomain(
  siteUrl: string,
  slug: string,
  deps: Omit<DomainVerifyDeps, 'db'> = {},
): Promise<boolean> {
  const fetchWk = deps.fetchWellKnown ?? httpsGet;
  try {
    const target = await resolvePublicTarget(siteUrl, deps.resolve ?? defaultResolver);
    const r = await fetchWk({
      host: target.url.host,
      ip: target.ip,
      path: WELL_KNOWN_PATH,
      timeoutMs: DOMAIN_FETCH_TIMEOUT_MS,
    });
    // a 3xx is never followed: it simply fails the file check
    if (r.status === 200 && r.body.split(/\s+/).includes(slug)) return true;
  } catch {
    /* fall through to the DNS TXT proof */
  }
  return txtCheck(siteUrl, slug, deps);
}

async function txtCheck(
  siteUrl: string,
  slug: string,
  deps: Omit<DomainVerifyDeps, 'db'>,
): Promise<boolean> {
  try {
    const host = new URL(siteUrl).hostname;
    const records = await (deps.resolveTxt ?? resolveTxt)(host);
    return records.some((parts) => parts.join('') === `apibase-merchant=${slug}`);
  } catch {
    return false;
  }
}

/** Verify one merchant and store the result (also un-verifies a domain that stopped proving it). */
export async function verifyMerchantDomain(deps: DomainVerifyDeps, slug: string): Promise<boolean> {
  const rows = await deps.db.$queryRawUnsafe<Array<{ site_url: string; domain_verified: boolean }>>(
    `SELECT site_url, domain_verified FROM shop_merchants WHERE slug = $1`,
    slug,
  );
  if (!rows[0]) return false;
  const ok = await checkDomain(rows[0].site_url, slug, deps);
  if (ok !== rows[0].domain_verified) {
    await deps.db.$executeRawUnsafe(
      `UPDATE shop_merchants SET domain_verified = $2 WHERE slug = $1`,
      slug,
      ok,
    );
  }
  return ok;
}

/** Daily pass over every pending/active merchant. */
export async function runShopDomainVerify(
  deps: DomainVerifyDeps = { db: defaultShopDeps().db },
): Promise<{ checked: number; verified: number }> {
  const rows = await deps.db.$queryRawUnsafe<Array<{ slug: string }>>(
    `SELECT slug FROM shop_merchants WHERE status IN ('pending', 'active') ORDER BY slug`,
  );
  let verified = 0;
  for (const { slug } of rows) {
    try {
      if (await verifyMerchantDomain(deps, slug)) verified++;
    } catch (err) {
      logger.error({ err, job: 'shop-domain-verify', slug }, 'domain verify failed');
    }
  }
  return { checked: rows.length, verified };
}
