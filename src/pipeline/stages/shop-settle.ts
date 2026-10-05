import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload } from '@x402/core/schemas';
import { logger } from '../../config/logger';
import { buildServerX402Requirements } from '../../config/x402.config';
import { getSharedResourceServer } from '../../services/x402-server.service';
import type { ShopDeps } from '../../shop/merchant-lifecycle.service';
import { fulfillPaidOrder } from '../../shop/adapters/shop-order.adapter';
import {
  confirmPayment,
  failPayment,
  type BuyerAgent,
  type OrderView,
  type PaidInput,
} from '../../shop/order-payment.service';

/** What escrowQuotePayment knows after the PAYING commit; settle needs exactly this. */
export interface PayingOrder {
  order_id: string;
  payment_id: string;
  payer: string;
  amount_usd: number;
  pay_to: string;
  header: string | undefined;
  request_id?: string;
  buyer_agent?: BuyerAgent;
}

export type SettleOutcome =
  | { kind: 'paid'; order: OrderView }
  | { kind: 'pending'; order_id: string }
  | { kind: 'failed'; order_id: string; reason: string };

/** The PROVIDER_CALL leg for a confirmed payment: confirm (-> PAID) then the `shop` adapter. */
export async function finalizeConfirmed(deps: ShopDeps, p: PaidInput): Promise<OrderView | null> {
  const moved = await confirmPayment(deps, p);
  if (!moved) return null;
  let res: Awaited<ReturnType<typeof fulfillPaidOrder>>;
  try {
    res = await fulfillPaidOrder(deps, p.order_id);
  } catch (e) {
    // Money is confirmed and committed: the order stays PAID (never roll the payment back).
    logger.error(
      { orderId: p.order_id, err: e instanceof Error ? e.message : String(e) },
      'shop provider call failed after confirmed payment — order left PAID',
    );
    res = { state: 'PAID' };
  }
  return {
    order_id: p.order_id,
    state: res.state,
    tx_hash: p.tx_hash,
    ...(res.fulfillment !== undefined ? { fulfillment: res.fulfillment } : {}),
  };
}

/**
 * §7.2 settle BEFORE delivery. The settle goes through the shared resource server (local
 * facilitator; it already falls back to PayAI itself, and only when the local one THROWS).
 * `success:false` is final: no second settle, no PayAI. `success:true` with an empty
 * `transaction` is a receipt timeout: the row stays pending for the reconcile job.
 */
export const SETTLE_RECEIPT_TIMEOUT_MS = 30_000;

export async function settleAndFinalize(
  deps: ShopDeps,
  p: PayingOrder,
  timeoutMs: number = SETTLE_RECEIPT_TIMEOUT_MS,
): Promise<SettleOutcome> {
  const fail = async (reason: string): Promise<SettleOutcome> => {
    await failPayment(deps, { order_id: p.order_id, payment_id: p.payment_id, reason });
    return { kind: 'failed', order_id: p.order_id, reason };
  };
  let result: { success: boolean; transaction?: string; errorReason?: string };
  try {
    const payload = parsePaymentPayload(decodePaymentSignatureHeader(p.header ?? ''));
    if (!payload.success) return await fail('settle_payload_unreadable');
    const requirements = { ...buildServerX402Requirements(p.amount_usd), payTo: p.pay_to };
    // The SDK does not bound its receipt wait by maxTimeoutSeconds (viem default 180 s), so the
    // 30 s cap is enforced here. On timeout the settle keeps running: the row stays pending and
    // a late success is finalized below; a late failure is left to the reconcile job (the
    // transfer may still be mined, so it must not become PAYMENT_FAILED).
    const settling = getSharedResourceServer().settlePayment(
      payload.data as never,
      requirements as never,
    ) as Promise<{ success: boolean; transaction?: string; errorReason?: string }>;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = Symbol('timeout');
    const first = await Promise.race([
      settling,
      new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
    if (first === timedOut) {
      logger.warn(
        { requestId: p.request_id, orderId: p.order_id },
        'shop settle: receipt not seen in time — order stays PAYING, reconcile decides',
      );
      void settling
        .then(async (late) => {
          if (late.success && late.transaction) {
            await finalizeConfirmed(deps, {
              order_id: p.order_id,
              payment_id: p.payment_id,
              tx_hash: late.transaction,
              payer: p.payer,
              request_id: p.request_id,
              buyer_agent: p.buyer_agent,
            });
          }
        })
        .catch((e) =>
          logger.warn(
            { orderId: p.order_id, err: e instanceof Error ? e.message : String(e) },
            'shop settle: late result handling failed — reconcile will pick it up',
          ),
        );
      return { kind: 'pending', order_id: p.order_id };
    }
    result = first;
  } catch (e) {
    logger.warn(
      { requestId: p.request_id, err: e instanceof Error ? e.message : String(e) },
      'shop settle: facilitators threw — PAYMENT_FAILED, reconcile will still look on-chain',
    );
    return fail('settle_threw');
  }
  if (!result.success) {
    logger.warn(
      { requestId: p.request_id, errorReason: result.errorReason },
      'shop settle: refused — PAYMENT_FAILED, nothing delivered',
    );
    return fail(`settle_failed:${result.errorReason ?? 'unknown'}`);
  }
  if (!result.transaction) return { kind: 'pending', order_id: p.order_id };

  const order = await finalizeConfirmed(deps, {
    order_id: p.order_id,
    payment_id: p.payment_id,
    tx_hash: result.transaction,
    payer: p.payer,
    request_id: p.request_id,
    buyer_agent: p.buyer_agent,
  });
  return {
    kind: 'paid',
    order: order ?? { order_id: p.order_id, state: 'PAID', tx_hash: result.transaction },
  };
}
