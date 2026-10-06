import { buildPaymentRequiredResponse, escrowQuotePayment } from '../pipeline/stages/escrow.stage';
import type { PipelineContext } from '../pipeline/types';
import type { ShopDeps } from './merchant-lifecycle.service';
import { getQuote, type Buyer } from './quote.service';
import { findPlacedOrder, payResponseBody, type BuyerAgent } from './order-payment.service';
import type { PaymentBinding } from '../pipeline/stages/escrow.stage';
import { parsePiiEnvelopes, PII_DOCS_URL, PiiRejected } from './pii/envelope.schema';
import { checkPiiForPay, storeEnvelopes } from './pii/pii.service';
import { periodRefusal } from './subscription.service';

export interface PayRequest {
  quote_id: string;
  /** The raw X-Payment / PAYMENT-SIGNATURE value; absent -> the 402 challenge. */
  x402PaymentHeader?: string;
  buyer: Buyer;
  requestId: string;
  /** Host the buyer reached us on; names the callable resource url in the 402. */
  host: string;
  waive_withdrawal?: boolean;
  buyer_company?: string;
  /** T-INT-21: `{kind: {kid, alg, ciphertext_b64}}`, untouched caller input; parsed here, never logged. */
  pii?: unknown;
  /** §8.4 client/version (MCP) or user agent (REST), for the PAID event only. */
  buyer_agent?: BuyerAgent;
  /** Set by mppMiddleware after charge() succeeded (REST only; never on /mcp). */
  mpp?: NonNullable<Express.Request['mppPayment']>;
}

export interface PayResponse {
  status: number;
  body: Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUGGESTED: Record<number, string> = {
  402: 'add_payment',
  404: 'use_different_tool',
  409: 'fix_request',
  410: 'fix_request',
  429: 'retry_after_delay',
};

/**
 * §6.1 shop.order.pay / §6.3 POST /quotes/:id/pay (x402). The money decision is ESCROW's
 * (`escrowQuotePayment`: verify, claim, settle with receipt, PAID, delivery); this only shapes its
 * outcome for the two transports: 200 `paid` (order incl. fulfillment), 202 `payment_pending`
 * (receipt not seen yet), 200 `already_placed` (repeat without payment by the same payer).
 */
export async function payQuote(deps: ShopDeps, r: PayRequest): Promise<PayResponse> {
  if (!r.x402PaymentHeader && !r.mpp) {
    const placed = await findPlacedOrder(deps.db, r.quote_id, r.buyer.identity);
    if (placed) {
      return {
        status: 200,
        body: {
          status: 'already_placed',
          order_id: placed.order_id,
          state: placed.state,
          order: placed,
        },
      };
    }
  }

  const ctx = {
    requestId: r.requestId,
    method: 'POST',
    path: `/api/v1/shop/quotes/${r.quote_id}/pay`,
    body: {
      quote_id: r.quote_id,
      waive_withdrawal: r.waive_withdrawal,
      buyer_company: r.buyer_company,
    },
    headers: {},
    toolId: 'shop.order.pay',
    agentId: r.buyer.identity,
    x402Paid: Boolean(r.x402PaymentHeader),
    x402PaymentHeader: r.x402PaymentHeader,
    buyerAgent: r.buyer_agent,
    ...(r.mpp
      ? {
          mppPaid: true,
          mppPayer: r.mpp.payer,
          mppMethod: r.mpp.method,
          mppPaymentHeader: r.mpp.header,
          mppAmount: r.mpp.amount,
          mppTxHash: r.mpp.txHash,
          mppRecipient: r.mpp.recipient,
          mppSplits: r.mpp.splits,
        }
      : {}),
  } as unknown as PipelineContext;

  // T-INT-21: buyer data is validated before ESCROW sees the request. Only ciphertext is ever kept.
  const refuse = async (
    code: number,
    error: string,
    message: string,
    extra: Record<string, unknown>,
  ): Promise<PayResponse> => {
    if (r.mpp) {
      // mppMiddleware already charged this credential: a refusal here is a refund owed.
      const { recordMppRefundOwed } = await import('../pipeline/stages/escrow-finalize.stage');
      await recordMppRefundOwed(ctx, `pii_rejected:${error}`);
    }
    return {
      status: code,
      body: {
        error,
        error_code: error,
        message,
        request_id: r.requestId,
        suggested_action: 'fix_request',
        documentation_url: PII_DOCS_URL,
        ...extra,
      },
    };
  };
  // T-INT-41: a period that is already paid (or of a subscription that ended) is refused BEFORE
  // ESCROW, so no money moves for it.
  if (UUID_RE.test(r.quote_id)) {
    const no = await periodRefusal(deps.db, r.quote_id);
    if (no) {
      return refuse(no.code, no.error, no.message, {
        documentation_url: '/docs/integrator#subscriptions',
      });
    }
  }
  let pii: ReturnType<typeof parsePiiEnvelopes>;
  try {
    pii = parsePiiEnvelopes(r.pii);
  } catch (e) {
    if (e instanceof PiiRejected) return refuse(400, e.code, e.message, {});
    throw e;
  }
  const settlement = Boolean(r.x402PaymentHeader || r.mpp);
  if (UUID_RE.test(r.quote_id)) {
    const q = await deps.db.$queryRawUnsafe<Array<{ merchant_id: string; requires_pii: string[] }>>(
      `SELECT merchant_id, requires_pii FROM shop_quotes WHERE quote_id = $1::uuid`,
      r.quote_id,
    );
    const refusal = q[0] ? await checkPiiForPay(deps.db, q[0], pii, settlement) : null;
    if (refusal) return refuse(refusal.code, refusal.error, refusal.message, refusal.extra);
  }
  // The envelopes ride the transaction ESCROW opens first (lock + binding + PAYING): written there
  // or not at all, so a refused or unverified payment leaves no ciphertext behind.
  let first = true;
  const escrowDeps: ShopDeps =
    pii.size === 0
      ? deps
      : {
          ...deps,
          transaction: (fn) =>
            deps.transaction(async (tx) => {
              const res = await fn(tx);
              if (first) {
                first = false;
                const v = res as { ok?: boolean; value?: { order_id?: string } };
                if (v.ok === true && v.value?.order_id) {
                  await storeEnvelopes(tx, v.value.order_id, pii);
                }
              }
              return res;
            }),
        };

  const res = await escrowQuotePayment(escrowDeps, ctx);
  if (res.ok) {
    return payResponseBody(res.value);
  }

  const e = res.error;
  const base = {
    error: e.error,
    error_code: e.error,
    message: e.message,
    request_id: r.requestId,
    suggested_action: SUGGESTED[e.code] ?? 'contact_support',
  };
  const binding = e.extra?.binding as PaymentBinding | undefined;
  if (e.code === 402 && binding) {
    // The challenge (and every refusal) is rebuilt from the SERVER binding, never echoed back.
    let pay: unknown;
    try {
      pay = (await getQuote(deps, r.quote_id)).pay;
    } catch {
      /* the quote moved on between the lock and now: the accepts[] below is still exact */
    }
    return {
      status: 402,
      body: {
        ...buildPaymentRequiredResponse(binding, { requestId: r.requestId, host: r.host }),
        ...base,
        ...(pay ? { pay } : {}),
      },
    };
  }
  const { binding: _b, ...extra } = e.extra ?? {};
  return { status: e.code, body: { ...base, ...extra } };
}
