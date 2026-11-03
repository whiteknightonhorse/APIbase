import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getReadiness } from '../services/health.service';
import { existsSync } from 'node:fs';
import { getRefundEnv } from '../config/env';
import { getPrisma } from '../services/prisma.service';
import { ensureRedisConnected } from '../services/redis.service';
import { cfgFromEnv, currentKeys, LAST_RUN_KEY } from '../jobs/refund-payout.job';
import { makeBaseChain, makeTempoChain } from '../refunds/refund-chains';
import type { Rail } from '../refunds/refund-payout.core';
import { getStatusLine } from '../services/status-line.service';

/**
 * Health check routes (§12.164, §12.167).
 *
 * GET /health/live  — liveness: process alive, event loop responsive. Always 200.
 * GET /health/ready — readiness: PG + Redis + config. 200 or 503.
 * GET /health/status-line — one text line for the homepage (nginx SSI), from readiness, cached 10 s.
 *
 * These routes are exempt from Nginx rate limiting (§12.239).
 */
export const healthRouter = Router();

healthRouter.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

healthRouter.get('/health/ready', async (_req: Request, res: Response) => {
  const result = await getReadiness();
  res.status(result.status === 'ready' ? 200 : 503).json(result);
});

healthRouter.get('/health/status-line', async (_req: Request, res: Response) => {
  res.type('text/plain; charset=utf-8').send(await getStatusLine());
});

const refundHealthLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

/** T-0553: refund wallet addresses, balances, flags and last run. Never a key. */
healthRouter.get(
  '/health/refund-wallet',
  refundHealthLimiter,
  async (_req: Request, res: Response) => {
    try {
      res
        .set('Cache-Control', 'no-store')
        .status(200)
        .json(await refundWalletHealth());
    } catch {
      res.status(503).json({ error: 'refund_wallet_health_unavailable' });
    }
  },
);

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
