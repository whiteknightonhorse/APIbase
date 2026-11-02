import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload } from '@x402/core/schemas';
import { logger } from '../../config/logger';
import { buildServerX402Requirements } from '../../config/x402.config';
import { shopFailedAuthorizationChecksTotal, withSettleKind } from '../../services/metrics.service';
import { toMicroUsdc } from '../../config/x402.config';
import type { ChainReader } from '../../jobs/shop-payment-reconcile.job';
import { getSharedResourceServer } from '../../services/x402-server.service';
import type {
  Eip3009Authorization,
  LocalFacilitatorClient,
} from '../../payments/local-facilitator';
import {
  isFacilitatorTimeout,
  isSettlementPending,
  settleTxHash,
} from '../../payments/settle-outcome';
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
  /** T-INT-42: the payer signed two authorizations; settle is one Multicall3 `aggregate3`. */
  fee_split?: { fee_to: string; fee_usd: number; fee_nonce: string };
  request_id?: string;
  buyer_agent?: BuyerAgent;
}

export type SettleOutcome =
  | { kind: 'paid'; order: OrderView }
  | { kind: 'pending'; order_id: string }
  | { kind: 'failed'; order_id: string; reason: string };

let feeSplitSettler: LocalFacilitatorClient | undefined;

/** The two signed legs of a fee-split header -> one atomic settle on the local facilitator. */
async function settleFeeSplitLegs(
  payload: unknown,
): Promise<{ success: boolean; transaction?: string; errorReason?: string }> {
  const inner = (
    payload as {
      payload?: {
        authorization?: Eip3009Authorization;
        signature?: string;
        feeAuthorization?: { authorization?: Eip3009Authorization; signature?: string };
      };
    }
  ).payload;
  const a1 = inner?.authorization;
  const a2 = inner?.feeAuthorization?.authorization;
  if (!a1 || !a2 || !inner?.signature || !inner.feeAuthorization?.signature) {
    return { success: false, errorReason: 'fee_split_payload_unreadable' };
  }
  // Loaded only here: the ordinary settle path never pays the viem import.
  const { buildLocalFacilitatorClient } = await import('../../payments/local-facilitator');
  feeSplitSettler ??= buildLocalFacilitatorClient();
  return feeSplitSettler.settleFeeSplit(a1, inner.signature, a2, inner.feeAuthorization.signature);
}

/** T-0552 (S8): reads after a failed settle, seconds after the failure. */
export const FAILED_CHECK_OFFSETS_S = [15, 45, 120] as const;
/** The final read: an EIP-3009 authorization cannot execute after validBefore; +60 s is margin for clock skew and block time. */
export const FAILED_CHECK_FINAL_GRACE_S = 60;

export type FailedCheckOutcome = 'used' | 'unused' | 'dead' | 'rpc_error' | 'skipped';

interface FailedPaymentRow {
  order_id: string;
  payer: string;
  eip3009_nonce: string | null;
  pay_to: string;
  amount_usd: string;
  splits: Array<{ mode?: string; nonce?: string; fee?: number }> | null;
  created_at: Date;
  chain_status: string;
}

/**
 * One targeted read of the authorization(s) of a FAILED shop payment. Used -> the transfer landed:
 * `finalizeConfirmed` (PAID if the order still accepts it, else `paid_after_terminal` in the refund
 * ledger via confirmPayment). Unused on the final read -> the authorization is dead: nothing is
 * owed and a re-pay is allowed; the marker is an element `{"mode":"dead_at","dead_at":<ts>}`
 * appended to the existing `splits` jsonb array (no migration; consumers sum `amount_usd` and
 * look for `in_tx`/`receivable`, so the element is inert). RPC error -> logged once by the caller,
 * the 60-s reconcile job is the backstop. Never signs, never sends.
 */
export async function checkFailedAuthorization(
  deps: ShopDeps,
  chain: ChainReader,
  payment_id: string,
  final = false,
): Promise<FailedCheckOutcome> {
  try {
    const rows = await deps.db.$queryRawUnsafe<FailedPaymentRow[]>(
      `SELECT order_id, payer, eip3009_nonce, pay_to, amount_usd::text AS amount_usd, splits,
              created_at, chain_status
         FROM shop_payments WHERE payment_id = $1::uuid AND rail = 'base'`,
      payment_id,
    );
    const r = rows[0];
    if (!r || r.chain_status !== 'failed' || !r.eip3009_nonce) return 'skipped';
    const feeLeg = r.splits?.find((x) => x.mode === 'in_tx' && x.nonce);
    let used = await chain.authorizationUsed(r.payer, r.eip3009_nonce);
    let valueMicro = toMicroUsdc(Number(r.amount_usd));
    if (feeLeg?.nonce) {
      const feeUsed = await chain.authorizationUsed(r.payer, feeLeg.nonce);
      // One used and one not cannot happen with allowFailure=false: reconcile flags it for a human.
      if (used !== feeUsed) return 'skipped';
      valueMicro = String(BigInt(valueMicro) - BigInt(toMicroUsdc(Number(feeLeg.fee ?? 0))));
    }
    if (used) {
      const tx = await chain.findTransfer({
        payer: r.payer,
        to: r.pay_to,
        valueMicro,
        sinceMs: new Date(r.created_at).getTime(),
      });
      shopFailedAuthorizationChecksTotal.inc({ outcome: 'used' });
      logger.error(
        { orderId: r.order_id, paymentId: payment_id },
        'shop: a failed settle landed on chain after all',
      );
      if (!tx) return 'used'; // transfer not indexed yet: the reconcile job finishes it
      await finalizeConfirmed(deps, {
        order_id: r.order_id,
        payment_id,
        tx_hash: tx,
        payer: r.payer,
        request_id: 'shop-failed-authorization-check',
      });
      return 'used';
    }
    if (!final) return 'unused';
    const marked = await deps.db.$executeRawUnsafe(
      `UPDATE shop_payments
          SET splits = coalesce(splits, '[]'::jsonb)
                       || jsonb_build_array(jsonb_build_object('mode', 'dead_at', 'dead_at', now()))
        WHERE payment_id = $1::uuid AND chain_status = 'failed'
          AND valid_before + interval '60 seconds' <= now()
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(splits, '[]'::jsonb)) e
                           WHERE e->>'mode' = 'dead_at')`,
      payment_id,
    );
    if (marked) shopFailedAuthorizationChecksTotal.inc({ outcome: 'dead' });
    return 'dead';
  } catch (e) {
    shopFailedAuthorizationChecksTotal.inc({ outcome: 'rpc_error' });
    logger.warn(
      { paymentId: payment_id, err: e instanceof Error ? e.message : String(e) },
      'shop failed-authorization check: chain unavailable — reconcile is the backstop',
    );
    return 'rpc_error';
  }
}

/**
 * Follow-up for a failed settle: in-process setTimeout chain (no new infrastructure) calling
 * `checkFailedAuthorization` at +15/+45/+120 s and at validBefore + 60 s. Stops at the first
 * `used`. A worker restart loses the timers — acceptable: shop-payment-reconcile (every 60 s)
 * reads the same chain state and covers the whole window.
 */
export function scheduleFailedAuthorizationChecks(
  deps: ShopDeps,
  payment_id: string,
  opts: { chain?: ChainReader; validBeforeMs?: number | null; nowMs?: number } = {},
): void {
  const now = opts.nowMs ?? Date.now();
  const delays: Array<{ ms: number; final: boolean }> = FAILED_CHECK_OFFSETS_S.map((s) => ({
    ms: s * 1000,
    final: false,
  }));
  if (opts.validBeforeMs != null) {
    delays.push({
      ms: Math.max(opts.validBeforeMs + FAILED_CHECK_FINAL_GRACE_S * 1000 - now, 0),
      final: true,
    });
  }
  let stopped = false;
  let chain = opts.chain;
  for (const d of delays) {
    const t = setTimeout(() => {
      if (stopped) return;
      void (async () => {
        try {
          chain ??= await (await import('../../jobs/shop-payment-reconcile.job')).viemChain();
        } catch (e) {
          logger.warn(
            { paymentId: payment_id, err: e instanceof Error ? e.message : String(e) },
            'shop failed-authorization check: no chain client — reconcile is the backstop',
          );
          return;
        }
        if (stopped) return;
        const out = await checkFailedAuthorization(deps, chain, payment_id, d.final);
        if (out === 'used' || out === 'dead' || out === 'skipped') stopped = true;
      })();
    }, d.ms);
    t.unref?.();
  }
}

async function startFailedAuthorizationChecks(deps: ShopDeps, payment_id: string): Promise<void> {
  try {
    const rows = await deps.db.$queryRawUnsafe<Array<{ vb_ms: string | null }>>(
      `SELECT (EXTRACT(EPOCH FROM valid_before) * 1000)::bigint::text AS vb_ms
         FROM shop_payments WHERE payment_id = $1::uuid`,
      payment_id,
    );
    const vb = rows[0]?.vb_ms;
    scheduleFailedAuthorizationChecks(deps, payment_id, {
      validBeforeMs: vb != null ? Number(vb) : null,
    });
  } catch (e) {
    logger.warn(
      { paymentId: payment_id, err: e instanceof Error ? e.message : String(e) },
      'shop failed-authorization checks not scheduled — reconcile is the backstop',
    );
  }
}

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
    await startFailedAuthorizationChecks(deps, p.payment_id);
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
    const settling = (
      p.fee_split
        ? settleFeeSplitLegs(payload.data)
        : withSettleKind('order', () =>
            getSharedResourceServer().settlePayment(payload.data as never, requirements as never),
          )
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
    if (isFacilitatorTimeout(e)) {
      // T-0428: the outcome is indeterminate — the transfer may still be mined. Unknown is not
      // failed: the order stays PAYING and the reconcile job reads the chain. No second settle.
      logger.warn(
        { requestId: p.request_id, orderId: p.order_id },
        'shop settle: facilitator timed out — order stays PAYING, reconcile decides',
      );
      return { kind: 'pending', order_id: p.order_id };
    }
    logger.warn(
      { requestId: p.request_id, err: e instanceof Error ? e.message : String(e) },
      'shop settle: facilitators threw — PAYMENT_FAILED, reconcile will still look on-chain',
    );
    return fail('settle_threw');
  }
  if (isSettlementPending(result)) {
    // T-0428: broadcast but receipt not seen. Keep the hash on the payment row so reconcile
    // checks the receipt first; the order stays PAYING (never failed while the chain may confirm).
    await deps.db.$executeRawUnsafe(
      `UPDATE shop_payments SET tx_hash = $2 WHERE payment_id = $1::uuid AND tx_hash IS NULL`,
      p.payment_id,
      settleTxHash(result),
    );
    logger.warn(
      { requestId: p.request_id, orderId: p.order_id, txHash: settleTxHash(result) },
      'shop settle: settlement_pending — order stays PAYING, reconcile decides',
    );
    return { kind: 'pending', order_id: p.order_id };
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
