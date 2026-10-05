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
import { getOrderView, type BuyerAgent } from '../order-payment.service';
import type { PaymentContext } from '../../mcp/tool-adapter';

export const ORDER_TOOL_NAMES = [
  'shop.order.quote',
  'shop.order.cancel',
  'shop.order.pay',
  'shop.order.get',
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
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generics recurse on complex Zod shapes
  const reg = server.registerTool as any;

  reg.call(
    server,
    'shop.order.quote',
    {
      title: 'Quote an order',
      description:
        'Price snapshot for items of one merchant (slug): total_usd, expiry (15 min by default), stock held until then. Pay with x402 using pay.x402 (payTo, amount, network, asset, extra.quote_id). Errors: 409 out_of_stock (alternatives), 429 test_sku_daily_cap.',
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
      },
      outputSchema: {
        quote_id: z.string(),
        order_id: z.string(),
        items: z.array(z.record(z.unknown())),
        total_usd: z.number(),
        fee_disclosed: z.boolean(),
        expires_at: z.string(),
        requires_pii: z.array(z.string()),
        requires_human_confirmation: z.boolean(),
        pay: z.record(z.unknown()),
        terms_update_pending: z.record(z.unknown()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (a: { merchant: string } & Record<string, unknown>) => {
      try {
        const { merchant, ...input } = a;
        const buyer = await resolveBuyer({ apiKey });
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
        'Pay a quote with x402 (X-Payment header on this /mcp call, exact total_usd to the merchant payout wallet). The payment is settled and its receipt awaited BEFORE anything is delivered: status paid carries order {order_id, state, tx_hash, fulfillment?}; payment_pending (receipt not seen within 30 s) carries order_id, poll shop.order.get; repeating the call without payment on a quote you already paid returns already_placed. Without a payment the result is an error carrying the 402 challenge (accepts[0].payTo/amount, extra.quote_id) and pay.mpp.url for MPP clients. Errors: 402 payment_amount_mismatch, 410 quote_expired (a new quote is attached), 429 test_sku_daily_cap.',
      inputSchema: {
        quote_id: z.string(),
        waive_withdrawal: z.boolean().optional(),
        buyer_company: z.string().max(200).optional(),
      },
      outputSchema: {
        status: z.string(),
        order_id: z.string(),
        state: z.string(),
        order: z.record(z.unknown()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (a: { quote_id: string; waive_withdrawal?: boolean; buyer_company?: string }) => {
      try {
        const buyer = await resolveBuyer({ apiKey });
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
      title: 'Cancel an unpaid order',
      description:
        'Cancel an order that is still QUOTED (free): the quote is voided and held stock released. After payment use the refund flow.',
      inputSchema: { order_id: z.string(), reason: z.string().min(1).max(500) },
      outputSchema: { order_id: z.string(), state: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (a: { order_id: string; reason: string }) => {
      try {
        const buyer = await resolveBuyer({ apiKey });
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
        'Order state and tx_hash; fulfillment (the delivered content) only for the identity that paid, repeatable. Poll this after a payment_pending answer.',
      inputSchema: { order_id: z.string() },
      outputSchema: {
        order_id: z.string(),
        state: z.string(),
        tx_hash: z.string().nullable(),
        fulfillment: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a: { order_id: string }) => {
      try {
        const buyer = await resolveBuyer({ apiKey });
        return ok({ ...(await getOrderView(deps.db, a.order_id, buyer.identity)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );
}
