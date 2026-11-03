import { existsSync } from 'node:fs';
import { getRefundEnv } from '../config/env';
import { getPrisma } from '../services/prisma.service';
import { ensureRedisConnected } from '../services/redis.service';
import { cfgFromEnv, currentKeys, LAST_RUN_KEY } from '../jobs/refund-payout.job';
import { makeBaseChain, makeTempoChain } from './refund-chains';
import type { Rail } from './refund-payout.core';

/** GET /health/refund-wallet payload. Addresses, balances and flags only; never a key. */
export async function refundWalletHealth(): Promise<Record<string, unknown>> {
  const cfg = cfgFromEnv();
  const env = getRefundEnv();
  const keys = currentKeys();
  const out: Record<string, unknown> = {};
  for (const rail of ['base', 'tempo'] as const) {
    const k = keys[rail];
    let balance: number | null = null;
    if (k.state === 'ok' && k.address) {
      try {
        balance = await (
          rail === 'base' ? makeBaseChain(k.address) : makeTempoChain(k.address)
        ).balanceUsd();
      } catch {
        balance = null;
      }
    }
    out[rail] = {
      address: k.address,
      balance_usd: balance,
      ceiling_usd: cfg.ceilingUsd,
      low_usd: cfg.lowBalanceUsd,
      key: k.state,
    };
  }
  let lastRun: unknown = null;
  try {
    const raw = await (await ensureRedisConnected()).get(LAST_RUN_KEY);
    lastRun = raw ? JSON.parse(raw) : null;
  } catch {
    lastRun = null;
  }
  const owed: Record<Rail, number> = { base: 0, tempo: 0 };
  try {
    const rows = await getPrisma().$queryRaw<Array<{ rail: Rail; usd: number }>>`
      SELECT rail, COALESCE(SUM(amount_usd),0)::float8 AS usd FROM refund_ledger WHERE status = 'owed' GROUP BY rail`;
    for (const r of rows) owed[r.rail] = Number(r.usd);
  } catch {
    // leave zeros; the gauge job reports the real figures
  }
  return {
    ...out,
    enabled: cfg.enabled,
    dry_run: cfg.dryRun,
    kill_file_present: existsSync(env.REFUND_PAYOUT_KILL_FILE),
    last_run: lastRun,
    owed,
  };
}
