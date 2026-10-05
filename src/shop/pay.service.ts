import { buildPaymentRequiredResponse, escrowQuotePayment } from '../pipeline/stages/escrow.stage';
import type { PipelineContext } from '../pipeline/types';
import type { ShopDeps } from './merchant-lifecycle.service';
import { getQuote, type Buyer } from './quote.service';
import type { PaymentBinding } from '../pipeline/stages/escrow.stage';

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
}

export interface PayResponse {
  status: number;
  body: Record<string, unknown>;
}

const SUGGESTED: Record<number, string> = {
  402: 'add_payment',
  404: 'use_different_tool',
  409: 'fix_request',
  410: 'fix_request',
  429: 'retry_after_delay',
};

/**
 * §6.1 shop.order.pay / §6.3 POST /quotes/:id/pay (x402). The money decision is ESCROW's
 * (`escrowQuotePayment`); this only shapes its outcome for the two transports. Until INT-09 a
 * valid payment ends at PAYING and answers 202 `payment_pending`.
 */
export async function payQuote(deps: ShopDeps, r: PayRequest): Promise<PayResponse> {
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
  } as unknown as PipelineContext;

  const res = await escrowQuotePayment(deps, ctx);
  if (res.ok) {
    return {
      status: 202,
      body: { status: 'payment_pending', order_id: res.value.order_id, state: res.value.state },
    };
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
