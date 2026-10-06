import { logger } from '../config/logger';
import { defaultShopDeps } from '../shop/merchant-lifecycle.service';
import { runStreamSettle, type StreamSettleReport } from '../shop/stream.service';

/**
 * `shop-stream-settle` (worker, every minute): settles open `apibase_pilot` channels at $0.50,
 * hourly, or as soon as the payer requests a close on-chain (F-9, UC-7), or marks the
 * session closed once the payer has withdrawn (channel finalized on-chain).
 */
export async function runShopStreamSettle(nowMs: number = Date.now()): Promise<StreamSettleReport> {
  const report = await runStreamSettle(defaultShopDeps(), nowMs);
  if (
    report.settled > 0 ||
    report.failed > 0 ||
    report.close_requested > 0 ||
    report.finalized > 0
  ) {
    logger.info({ job: 'shop-stream-settle', ...report }, 'stream settle pass');
  }
  return report;
}
