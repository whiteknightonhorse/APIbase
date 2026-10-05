import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveBuyer } from '../buyer';
import { defaultShopDeps, toApiError, type ShopDeps } from '../merchant-lifecycle.service';
import { cancelOrder, createQuote, merchantIdBySlug, type QuoteResponse } from '../quote.service';

export const ORDER_TOOL_NAMES = ['shop.order.quote', 'shop.order.cancel'] as const;

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

/** §6.1 buyer order tools: quote and (until PAID) cancel. `shop.order.pay` is INT-08. */
export function registerOrderTools(
  server: McpServer,
  apiKey: string,
  requestId: string,
  deps: ShopDeps = defaultShopDeps(),
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
}
