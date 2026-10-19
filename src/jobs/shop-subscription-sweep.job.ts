import { logger } from '../config/logger';
import { defaultShopDeps } from '../shop/merchant-lifecycle.service';
import { runSubscriptionSweep } from '../shop/subscription.service';
import { forceDue, runMppRenewals } from '../shop/subscription-mpp.service';

/**
 * `shop-subscription-sweep` (worker, every 5 minutes; T-INT-41 / UC-9): first renews the due
 * `mpp_subscription` periods (T-0431: mppx `renew`, the platform signs with its own key and pays
 * the gas, once per period), then moves subscriptions whose paid period is over to past_due, tells
 * the merchant at +24 h (`subscription.past_due`), cancels them unpaid at +72 h and expires those
 * that reached their term. No other subscription is ever charged here.
 */
export async function runShopSubscriptionSweep(nowMs: number = Date.now()) {
  const deps = defaultShopDeps();
  let mpp: Awaited<ReturnType<typeof runMppRenewals>> | undefined;
  try {
    // Sandbox hook (testnet only, a no-op elsewhere): make the next period of ONE subscription due.
    const force = process.env['SHOP_SUB_FORCE_DUE_ID'];
    if (typeof force === 'string' && force !== '') await forceDue(deps, force, nowMs);
    mpp = await runMppRenewals(deps, nowMs);
  } catch (err) {
    // a failing renewal step must never stop the past_due / cancel / expire transitions
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'mpp subscription renewals failed',
    );
  }
  const report = await runSubscriptionSweep(deps, nowMs);
  if (report.changed > 0 || (mpp && (mpp.renewed > 0 || mpp.failed > 0 || mpp.unknown > 0))) {
    logger.info({ job: 'shop-subscription-sweep', ...report, mpp }, 'subscription sweep');
  }
  return { ...report, ...(mpp ? { mpp } : {}) };
}
