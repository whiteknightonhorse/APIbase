import { logger } from '../config/logger';
import { defaultShopDeps } from '../shop/merchant-lifecycle.service';
import { runSubscriptionPull } from '../shop/subscription-pull.service';

/**
 * `shop-subscription-pull` (worker, hourly at :00; T-INT-47 / UC-9 on Base): executes the
 * pre-signed EIP-3009 authorizations a payer stored for the coming periods of a subscription.
 * Each one is paid through the same ESCROW -> settle path as `shop.order.pay`; a period is
 * credited only by that payment.
 */
export async function runShopSubscriptionPull(nowMs: number = Date.now()) {
  const report = await runSubscriptionPull(defaultShopDeps(), nowMs);
  if (report.checked > 0 || report.failed > 0) {
    logger.info({ job: 'shop-subscription-pull', ...report }, 'subscription pull');
  }
  return report;
}
