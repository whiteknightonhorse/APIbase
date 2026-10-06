import { logger } from '../config/logger';
import { issueFeeInvoices } from '../shop/fee-invoice.service';
import { defaultShopDeps, type ShopDeps } from '../shop/merchant-lifecycle.service';

/** `shop-fee-invoice` (worker, 1st of the month 03:10 UTC): owed Base receivables -> one invoice per merchant. */
export async function runShopFeeInvoice(
  d: ShopDeps = defaultShopDeps(),
  nowMs: number = Date.now(),
): Promise<{ invoices_issued: number }> {
  const invoices_issued = await issueFeeInvoices(d, new Date(nowMs));
  logger.info({ job: 'shop-fee-invoice', invoices_issued }, 'fee invoices issued');
  return { invoices_issued };
}
