import { logger } from '../config/logger';
import { storefrontProbeCoverage } from '../services/metrics.service';
import type { ShopTx } from '../shop/db';
import { defaultShopDeps } from '../shop/merchant-lifecycle.service';
import {
  loadStorefront,
  selfTestStorefront,
  STOREFRONT_TOOL_NAMES,
  storefrontServerName,
} from '../shop/merchant-mcp-server';

/** §14: a random sample of this many active storefronts is initialised in-process each hour. */
export const PROBE_SAMPLE = 100;
/** §12.2 STOREFRONT_DOWN reads this code from shop_connect_events (plan §8 item 9). */
export const PROBE_ERROR_CODE = 'storefront_probe_failed';

export interface ProbeDeps {
  db: ShopTx;
  selfTest?: typeof selfTestStorefront;
  sample?: number;
}

export interface ProbeResult {
  active: number;
  probed: number;
  failed: number;
  coverage: number;
}

/** One storefront: build it, `initialize`, `tools/list` must be exactly the six buyer tools. */
export async function probeStorefront(d: ProbeDeps, slug: string): Promise<void> {
  const m = await loadStorefront(d.db, slug, { fresh: true });
  const t = await (d.selfTest ?? selfTestStorefront)(m);
  const exact =
    t.server_name === storefrontServerName(m) &&
    t.tools.length === STOREFRONT_TOOL_NAMES.length &&
    STOREFRONT_TOOL_NAMES.every((n) => t.tools.includes(n));
  if (!exact) throw new Error('storefront answered with an unexpected server name or tool list');
}

/** `shop-storefront-probe` (hourly, worker): sets `storefront_probe_coverage = probed / active`. */
export async function runShopStorefrontProbe(
  d: ProbeDeps = { db: defaultShopDeps().db },
): Promise<ProbeResult> {
  const limit = d.sample ?? PROBE_SAMPLE;
  const [rows, count] = await Promise.all([
    d.db.$queryRawUnsafe<Array<{ slug: string }>>(
      `SELECT slug FROM shop_merchants WHERE status = 'active' ORDER BY random() LIMIT $1::int`,
      limit,
    ),
    d.db.$queryRawUnsafe<Array<{ n: number | bigint }>>(
      `SELECT count(*)::int AS n FROM shop_merchants WHERE status = 'active'`,
    ),
  ]);
  const active = Number(count[0]?.n ?? 0);
  let failed = 0;
  for (const { slug } of rows) {
    try {
      await probeStorefront(d, slug);
    } catch (err) {
      failed++;
      logger.warn({ err, slug, job: 'shop-storefront-probe' }, 'storefront probe failed');
      try {
        await d.db.$executeRawUnsafe(
          `INSERT INTO shop_connect_events (error_code, path) VALUES ($1, $2)`,
          PROBE_ERROR_CODE,
          `/mcp/m/${slug}`,
        );
      } catch (e) {
        logger.warn({ err: e }, 'shop_connect_events insert failed');
      }
    }
  }
  const coverage = active === 0 ? 1 : rows.length / active;
  storefrontProbeCoverage.set(coverage);
  return { active, probed: rows.length, failed, coverage };
}
