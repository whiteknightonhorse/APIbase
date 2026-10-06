import { logger } from '../config/logger';
import { defaultShopDeps } from '../shop/merchant-lifecycle.service';
import { runSubscriptionSweep } from '../shop/subscription.service';

/**
 * `shop-subscription-sweep` (worker, every 5 minutes; T-INT-41 / UC-9): moves subscriptions whose
 * paid period is over to past_due, tells the merchant at +24 h (`subscription.past_due`), cancels
 * them unpaid at +72 h and expires those that reached their term. Nothing is ever charged here.
 */
export async function runShopSubscriptionSweep(nowMs: number = Date.now()) {
  const report = await runSubscriptionSweep(defaultShopDeps(), nowMs);
  if (report.changed > 0)
    logger.info({ job: 'shop-subscription-sweep', ...report }, 'subscription sweep');
  return report;
}
