import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ShopAuthError } from '../auth/errors';
import { authenticateMerchantKey, WRITE_LIMIT_PER_MIN } from '../auth/merchant-key.service';
import { deleteCatalog, MAX_ITEMS_PER_CALL, upsertCatalog } from '../catalog.service';
import { getProduct, searchCatalog, SEARCH_MAX_LIMIT } from '../catalog.read.service';
import { defaultShopDeps, toApiError, type ShopDeps } from '../merchant-lifecycle.service';

export const CATALOG_TOOL_NAMES = [
  'shop.merchant.catalog_upsert',
  'shop.merchant.catalog_delete',
  'shop.catalog.search',
  'shop.catalog.get',
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

// 60 writes/min per key (§6.2). Fixed window, per process: the MCP twin of the REST write limiter.
const windows = new Map<string, { start: number; n: number }>();
function takeWriteToken(key_hash: string, now: number): void {
  const w = windows.get(key_hash);
  if (!w || now - w.start >= 60_000) {
    windows.set(key_hash, { start: now, n: 1 });
    return;
  }
  if (++w.n > WRITE_LIMIT_PER_MIN) {
    throw new ShopAuthError(
      429,
      'catalog write limit reached (60/min per key)',
      'slow down and retry',
    );
  }
}

const reportShape = {
  upserted: z.number(),
  flagged: z.array(z.object({ sku: z.string(), reason: z.string() })),
  rejected: z.array(z.object({ sku: z.string(), reason: z.string(), category: z.string() })),
  errors: z.array(z.object({ index: z.number(), sku: z.string().nullable(), message: z.string() })),
};

/** §6.1 buyer tools (free, READ_ONLY) and §6.2 catalog tools (Bearer mk_live_, `catalog:write`). */
export function registerCatalogTools(
  server: McpServer,
  apiKey: string,
  requestId: string,
  deps: ShopDeps = defaultShopDeps(),
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generics recurse on complex Zod shapes
  const reg = server.registerTool as any;

  const writer = async () => {
    const m = await authenticateMerchantKey(deps.db, `Bearer ${apiKey}`);
    if (!m.scopes.includes('catalog:write'))
      throw new ShopAuthError(403, 'missing scope catalog:write');
    takeWriteToken(m.key_hash, (deps.now ?? Date.now)());
    return m;
  };

  reg.call(
    server,
    'shop.merchant.catalog_upsert',
    {
      title: 'Upsert catalog items',
      description: `Create or update up to ${MAX_ITEMS_PER_CALL} products, idempotent by sku (needs catalog:write). Prices $1.00..limits.max_order_usd; one $0.01 __apibase_test item (is_test) is allowed. Items in a prohibited category come back in rejected[]; instruction-like text is saved as flagged and hidden until reviewed.`,
      inputSchema: {
        items: z
          .array(z.record(z.unknown()))
          .max(MAX_ITEMS_PER_CALL)
          .describe(
            'F-2 items: sku, title, description, price_usd, category, ... (see docs/integrator.md#catalog).',
          ),
      },
      outputSchema: reportShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (a: { items: unknown }) => {
      try {
        const m = await writer();
        return ok({ ...(await upsertCatalog(deps, m.merchant_id, a.items)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.catalog_delete',
    {
      title: 'Delete catalog items',
      description:
        'Delete products by sku (needs catalog:write). Refused with 409 and quote_ids while an open quote holds one of the skus.',
      inputSchema: { skus: z.array(z.string()).min(1).max(MAX_ITEMS_PER_CALL) },
      outputSchema: { deleted: z.number(), not_found: z.array(z.string()) },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (a: { skus: unknown }) => {
      try {
        const m = await writer();
        return ok({ ...(await deleteCatalog(deps, m.merchant_id, a.skus)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.catalog.search',
    {
      title: 'Search a merchant catalog',
      description:
        'Full-text search in one merchant storefront (slug). Only active merchants and reviewed products; returns sku, title, price_usd, availability, requires_pii, fulfillment_mode. Page with next_cursor.',
      inputSchema: {
        merchant: z.string().describe('Merchant slug.'),
        query: z.string().max(200).optional(),
        category: z.string().optional(),
        max_price_usd: z.number().min(0).optional(),
        limit: z.number().int().min(1).max(SEARCH_MAX_LIMIT).optional(),
        cursor: z.string().optional(),
      },
      outputSchema: {
        merchant: z.object({
          name: z.string(),
          reputation: z.record(z.unknown()),
          policy_summary: z.record(z.unknown()),
        }),
        products: z.array(
          z.object({
            sku: z.string(),
            title: z.string(),
            price_usd: z.string(),
            availability: z.enum(['in_stock', 'out_of_stock']),
            requires_pii: z.array(z.string()),
            fulfillment_mode: z.enum(['instant', 'merchant', 'physical']),
          }),
        ),
        next_cursor: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a: Parameters<typeof searchCatalog>[1]) => {
      try {
        return ok({ ...(await searchCatalog(deps.db, a)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.catalog.get',
    {
      title: 'Get a product card',
      description:
        "Full product card by sku: shipping_options, delivery_slots, refund_policy and the merchant's encryption key (for end-to-end encrypted order details).",
      inputSchema: { merchant: z.string().describe('Merchant slug.'), sku: z.string() },
      outputSchema: {
        sku: z.string(),
        title: z.string(),
        description: z.string(),
        price_usd: z.string(),
        availability: z.string(),
        fulfillment_mode: z.string(),
        requires_pii: z.array(z.string()),
        shipping_options: z.array(z.unknown()),
        delivery_slots: z.array(z.unknown()),
        refund_policy: z.object({
          refund_window_days: z.number().nullable(),
          returns_accepted: z.boolean(),
        }),
        merchant: z.object({
          name: z.string(),
          reputation: z.record(z.unknown()),
          policy_summary: z.record(z.unknown()),
        }),
        merchant_encryption_key: z.unknown(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a: { merchant: string; sku: string }) => {
      try {
        return ok({ ...(await getProduct(deps.db, a)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );
}
