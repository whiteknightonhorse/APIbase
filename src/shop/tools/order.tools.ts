import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveBuyer } from '../buyer';
import { defaultShopDeps, toApiError, type ShopDeps } from '../merchant-lifecycle.service';
import {
  cancelOrder,
  createQuote,
  integratorConfig,
  merchantIdBySlug,
  type QuoteResponse,
} from '../quote.service';
import { openDispute, DISPUTE_REASONS, DISPUTE_NOTE_MAX } from '../dispute.service';
import { getOrderView, type BuyerAgent } from '../order-payment.service';
import { cancelSubscription, getSubscription } from '../subscription.service';
import { QuoteError } from '../quote.errors';
import type { PaymentContext } from '../../mcp/tool-adapter';

export const ORDER_TOOL_NAMES = [
  'shop.order.quote',
  'shop.order.cancel',
  'shop.order.pay',
  'shop.order.get',
  'shop.order.dispute',
  'shop.subscription.get',
  'shop.subscription.cancel',
] as const;

type Result = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const ok = (body: Record<string, unknown>): Result => ({
  content: [{ type: 'text', text: JSON.stringify(body) }],
  structuredContent: body,
});

function fail(err: unknown, request_id: string): Result {
  const { body } = toApiError(err, request_id);
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] };
}

/** F-5: on /mcp an order is paid by x402 only; the MPP url (REST) is not offered here. */
export function forMcp(q: QuoteResponse): QuoteResponse {
  const { mpp: _mpp, ...pay } = q.pay;
  return { ...q, pay };
}

/** F-5 for a renewal: `/mcp` offers x402 only, in the answer and in the 402 error alike. */
function renewForMcp<T extends { renew?: { pay: Record<string, unknown> } }>(v: T): T {
  if (!v.renew) return v;
  const { mpp: _mpp, ...pay } = v.renew.pay;
  return { ...v, renew: { ...v.renew, pay } };
}

/** §8.4: the MCP client name/version from `initialize`, when the transport has one. */
function mcpClient(server: McpServer): BuyerAgent | undefined {
  const v = (
    server as unknown as {
      server?: { getClientVersion?: () => { name?: string; version?: string } | undefined };
    }
  ).server?.getClientVersion?.();
  return v ? { client_name: v.name, client_version: v.version } : undefined;
}

/** §6.1 buyer order tools: quote, pay (x402 on /mcp: settle, PAID, delivery), get and cancel. */
export function registerOrderTools(
  server: McpServer,
  apiKey: string,
  requestId: string,
  deps: ShopDeps = defaultShopDeps(),
  paymentCtx?: PaymentContext,
  sessionId?: string,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generics recurse on complex Zod shapes
  const reg = server.registerTool as any;

  reg.call(
    server,
    'shop.order.quote',
    {
      title: 'Quote an order',
      description:
        'Price snapshot for items of one merchant (slug): total_usd, expiry (15 min by default), stock held until then. Pay with x402 using pay.x402 (payTo, amount, network, asset, extra.quote_id). Physical items need shipping_option (an id from the product shipping_options; its price is added as shipping_usd) and, when the product lists delivery_slots, delivery_slot (held until the quote expires). A subscription item is quoted alone with subscribe: true (422 if the item has no subscription); the quote is period 1. Errors: 409 out_of_stock (alternatives), 409 slot_unavailable (alternatives = free slots), 429 test_sku_daily_cap.',
      inputSchema: {
        merchant: z.string().describe('Merchant slug.'),
        items: z
          .array(
            z.object({
              sku: z.string(),
              variant: z.string().optional(),
              qty: z.number().int().min(1),
            }),
          )
          .min(1),
        shipping_option: z.string().optional(),
        delivery_slot: z.string().optional(),
        buyer_ref: z.string().max(200).optional(),
        subscribe: z
          .boolean()
          .optional()
          .describe(
            'true: quote period 1 of the item subscription (one item, qty 1). The answer carries subscription_terms.',
          ),
      },
      outputSchema: {
        quote_id: z.string(),
        order_id: z.string(),
        items: z.array(z.record(z.unknown())),
        total_usd: z.number(),
        shipping_usd: z.number().optional(),
        shipping_option: z.string().optional(),
        delivery_slot: z.string().optional(),
        fee_disclosed: z.boolean(),
        expires_at: z.string(),
        requires_pii: z.array(z.string()),
        requires_human_confirmation: z.boolean(),
        merchant_encryption_key: z.unknown().optional(),
        pay: z.record(z.unknown()),
        terms_update_pending: z.record(z.unknown()).optional(),
        subscription_terms: z.record(z.unknown()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (a: { merchant: string } & Record<string, unknown>) => {
      try {
        const { merchant, ...input } = a;
        const buyer = await resolveBuyer({ apiKey, session: sessionId });
        const q = await createQuote(deps, await merchantIdBySlug(deps.db, merchant), buyer, input);
        return ok({ ...forMcp(q) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.order.pay',
    {
      title: 'Pay a quoted order',
      description:
        'Pay a quote with x402 (X-Payment header on this /mcp call, exact total_usd to the merchant payout wallet). The payment is settled and its receipt awaited BEFORE anything is delivered: status paid carries order {order_id, state, tx_hash, fulfillment?}; payment_pending (receipt not seen within 30 s) carries order_id, poll shop.order.get; repeating the call without payment on a quote you already paid returns already_placed. Without a payment the result is an error carrying the 402 challenge (accepts[0].payTo/amount, extra.quote_id) and pay.mpp.url for MPP clients. Errors: 402 payment_amount_mismatch, 410 quote_expired (a new quote is attached), 429 test_sku_daily_cap, 422 pii_required (+ merchant_encryption_key), 409 merchant_key_rotated, 400 pii_plaintext_rejected.',
      inputSchema: {
        quote_id: z.string(),
        waive_withdrawal: z.boolean().optional(),
        buyer_company: z.string().max(200).optional(),
        pii: z
          .unknown()
          .optional()
          .describe(
            'Buyer data the quote lists in requires_pii, ONE envelope per kind: {"<kind>": {kid, alg: "hpke-x25519-sha256-chacha20" | "sealed-box-x25519", ciphertext_b64}}, encrypted to merchant_encryption_key (AAD = quote_id, max 16 KB). Plaintext is refused with 400 pii_plaintext_rejected.',
          ),
      },
      outputSchema: {
        status: z.string(),
        order_id: z.string(),
        state: z.string(),
        order: z.record(z.unknown()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (a: {
      quote_id: string;
      waive_withdrawal?: boolean;
      buyer_company?: string;
      pii?: unknown;
    }) => {
      try {
        const buyer = await resolveBuyer({ apiKey, session: sessionId });
        // Lazy: the escrow stage pulls the x402 SDK, which the other order tools do not need.
        const { payQuote } = await import('../pay.service');
        const r = await payQuote(deps, {
          quote_id: a.quote_id,
          x402PaymentHeader: paymentCtx?.x402PaymentHeader ?? undefined,
          buyer,
          requestId,
          host: new URL(integratorConfig().public_url).host,
          waive_withdrawal: a.waive_withdrawal,
          buyer_company: a.buyer_company,
          pii: a.pii,
          buyer_agent: mcpClient(server),
        });
        if (r.status === 202 || r.status === 200) return ok(r.body);
        return {
          isError: true,
          content: [{ type: 'text' as const, text: JSON.stringify(r.body) }],
        };
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.order.cancel',
    {
      title: 'Cancel an order',
      description:
        'QUOTED: free cancel, the quote is voided and held stock released. After payment: before the merchant confirms it is always a refund (state REFUND_PENDING, due in 7 days); later only if the merchant accepts returns and the refund window is open, else 409 with the policy. Digital content delivered under waive_withdrawal cannot be cancelled.',
      inputSchema: { order_id: z.string(), reason: z.string().min(1).max(500) },
      outputSchema: {
        order_id: z.string(),
        state: z.string(),
        refund_id: z.string().nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (a: { order_id: string; reason: string }) => {
      try {
        const buyer = await resolveBuyer({ apiKey, session: sessionId });
        return ok({ ...(await cancelOrder(deps, buyer, a.order_id, a.reason)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.order.get',
    {
      title: 'Get an order',
      description:
        'Order state, events, tracking {carrier, number, url?} and delivery_eta (null until the merchant ships), refund_policy and tx_hash. For the identity that paid also: fulfillment (the delivered content, repeatable), documents (merchant links), merchant_contact {email, site_url} while the order is open (not once CLOSED). Poll this after a payment_pending answer.',
      inputSchema: { order_id: z.string() },
      outputSchema: {
        order_id: z.string(),
        state: z.string(),
        tx_hash: z.string().nullable(),
        fulfillment: z.string().optional(),
        events: z.array(z.record(z.unknown())),
        tracking: z
          .object({ carrier: z.string(), number: z.string(), url: z.string().optional() })
          .nullable(),
        delivery_eta: z.string().nullable().optional(),
        merchant_contact: z.object({ email: z.string(), site_url: z.string() }).optional(),
        documents: z.array(z.record(z.unknown())).optional(),
        refund_policy: z.record(z.unknown()),
        subscription: z.object({ id: z.string(), period_no: z.number() }).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a: { order_id: string }) => {
      try {
        const buyer = await resolveBuyer({ apiKey, session: sessionId });
        return ok({ ...(await getOrderView(deps.db, a.order_id, buyer.identity)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.order.dispute',
    {
      title: 'Dispute an order',
      description: `Open a dispute on an order you paid (PAID..DELIVERED). reason_code: ${DISPUTE_REASONS.join(', ')}; note up to ${DISPUTE_NOTE_MAX} characters. The order becomes DISPUTED and the merchant has 7 days to answer (by refunding it); an unanswered dispute expires and counts in the merchant's reputation, which can suspend its quotes. A verified refund resolves the dispute. One open dispute per order; another identity's order is 404.`,
      inputSchema: {
        order_id: z.string(),
        reason_code: z.enum(DISPUTE_REASONS),
        note: z.string().max(DISPUTE_NOTE_MAX).optional(),
      },
      outputSchema: {
        dispute_id: z.string(),
        order_id: z.string(),
        status: z.string(),
        reason_code: z.string(),
        due_at: z.string().nullable(),
        state: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (a: { order_id: string; reason_code: string; note?: string }) => {
      try {
        const buyer = await resolveBuyer({ apiKey, session: sessionId });
        const r = await openDispute(deps, buyer, a);
        return ok({ ...r, due_at: r.due_at ? new Date(r.due_at).toISOString() : null });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );
  reg.call(
    server,
    'shop.subscription.get',
    {
      title: 'Get a subscription',
      description:
        "Status of a subscription you pay for: status (active | past_due | canceled | expired), period_no, current_period_end, next_charge_at. From 72 h before to 72 h after current_period_end the answer carries renew {quote_id, expires_at, total_usd, period_no, pay}: pay that quote with x402 (shop.order.pay) to buy the next period; the same quote is returned while it lives, a new one once it expired. Nothing is charged automatically: the buyer's agent renews by paying. Once the period is over unpaid the call fails with 402 subscription_renewal_due (same renew attached); 72 h later the subscription is canceled (status_reason unpaid). Another identity's subscription is 404.",
      inputSchema: { subscription_id: z.string() },
      outputSchema: {
        subscription_id: z.string(),
        sku: z.string(),
        status: z.string(),
        status_reason: z.string().nullable(),
        period_no: z.number(),
        current_period_end: z.string().nullable(),
        next_charge_at: z.string().nullable(),
        max_periods: z.number().nullable(),
        canceled_at: z.string().optional(),
        access_until: z.string().optional(),
        renew: z.record(z.unknown()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (a: { subscription_id: string; merchant?: string }) => {
      try {
        const buyer = await resolveBuyer({ apiKey, session: sessionId });
        const merchant_id = a.merchant ? await merchantIdBySlug(deps.db, a.merchant) : undefined;
        return ok({
          ...renewForMcp(await getSubscription(deps, buyer, a.subscription_id, { merchant_id })),
        });
      } catch (err) {
        if (err instanceof QuoteError && err.extra?.renew) {
          return fail(
            new QuoteError(
              err.status,
              err.error_code,
              err.message,
              err.suggested_action,
              renewForMcp(err.extra as { renew?: { pay: Record<string, unknown> } }),
            ),
            requestId,
          );
        }
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.subscription.cancel',
    {
      title: 'Cancel a subscription',
      description:
        "Cancel a subscription you pay for. The period already paid runs to current_period_end (access_until); no further renewal quotes are issued. Idempotent. Another identity's subscription is 404.",
      inputSchema: { subscription_id: z.string(), reason: z.string().max(500).optional() },
      outputSchema: {
        subscription_id: z.string(),
        sku: z.string(),
        status: z.string(),
        status_reason: z.string().nullable(),
        period_no: z.number(),
        current_period_end: z.string().nullable(),
        next_charge_at: z.string().nullable(),
        max_periods: z.number().nullable(),
        canceled_at: z.string().optional(),
        access_until: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (a: { subscription_id: string; reason?: string; merchant?: string }) => {
      try {
        const buyer = await resolveBuyer({ apiKey, session: sessionId });
        const merchant_id = a.merchant ? await merchantIdBySlug(deps.db, a.merchant) : undefined;
        return ok({
          ...(await cancelSubscription(deps, buyer, a.subscription_id, a.reason, { merchant_id })),
        });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );
}
