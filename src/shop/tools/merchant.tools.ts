import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ShopAuthError } from '../auth/errors';
import { rotateKey } from '../auth/identity.service';
import { authenticateMerchantKey, type AuthedMerchant } from '../auth/merchant-key.service';
import { termsStatus } from '../auth/terms.guard';
import {
  addMerchantDocument,
  confirmMerchantOrder,
  shipMerchantOrder,
  listMerchantOrders,
} from '../order-lifecycle.service';
import { runCheck } from '../check.service';
import { getMerchantStats } from '../stats.service';
import { merchantRefund } from '../refund.service';
import { setWebhook, WEBHOOK_EVENTS } from '../webhook/webhook.service';
import {
  acceptTerms,
  defaultShopDeps,
  deactivateMerchant,
  registerWithDocs,
  toApiError,
  type ShopDeps,
} from '../merchant-lifecycle.service';

const doc = z.object({
  doc_id: z.string(),
  version: z.string(),
  sha256: z.string(),
  url: z.string().optional(),
});
const banner = z
  .object({ docs: z.array(doc) })
  .optional()
  .describe('Present when a newer document version awaits re-acceptance (30-day window).');

const ENC_KEY = z.object({
  kid: z.string(),
  alg: z.string(),
  pub: z.string(),
  sig_by_wallet: z.string().describe('EIP-191 signature by `wallet` over the encryption-key text.'),
});

export const MERCHANT_TOOL_NAMES = [
  'shop.merchant.register',
  'shop.merchant.accept_terms',
  'shop.merchant.rotate_key',
  'shop.merchant.deactivate',
  'shop.merchant.orders_list',
  'shop.merchant.order_confirm',
  'shop.merchant.order_ship',
  'shop.merchant.order_document',
  'shop.merchant.refund',
  'shop.merchant.webhook_set',
  'shop.merchant.check',
  'shop.merchant.stats',
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

async function bearer(d: ShopDeps, apiKey: string, scope?: string): Promise<AuthedMerchant> {
  const m = await authenticateMerchantKey(d.db, `Bearer ${apiKey}`);
  if (scope && !m.scopes.includes(scope)) throw new ShopAuthError(403, `missing scope ${scope}`);
  return m;
}

async function bannerFor(d: ShopDeps, merchant_id: string) {
  const rows = await d.db.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT status FROM shop_merchants WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  if (rows[0]?.status !== 'active') return {};
  const st = await termsStatus(d.db, merchant_id, (d.now ?? Date.now)());
  const docs = [...st.pending, ...st.overdue].map(({ doc_id, version, sha256, url }) => ({
    doc_id,
    version,
    sha256,
    url,
  }));
  return docs.length > 0 ? { terms_update_pending: { docs } } : {};
}

/**
 * §6.2 merchant tools on /mcp. register/accept_terms are authenticated by a wallet signature
 * in the arguments; rotate_key/deactivate by the `Bearer mk_live_` key the session was opened with.
 */
export function registerMerchantTools(
  server: McpServer,
  apiKey: string,
  requestId: string,
  deps: ShopDeps = defaultShopDeps(),
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generics recurse on complex Zod shapes
  const reg = server.registerTool as any;

  reg.call(
    server,
    'shop.merchant.register',
    {
      title: 'Register a merchant',
      description:
        'Register a merchant (status pending). Sign the sign-in message (purpose register, nonce from GET /api/v1/shop/auth/nonce) with the merchant wallet. Returns the documents to accept via shop.merchant.accept_terms.',
      inputSchema: {
        wallet: z.string(),
        slug: z.string(),
        name: z.string(),
        category: z.string(),
        country: z.string().describe('ISO 3166-1 alpha-2'),
        contact_email: z.string(),
        site_url: z.string(),
        payout_wallet: z.string().optional(),
        payout_wallet_base: z.string().optional(),
        payout_wallet_tempo: z.string().optional(),
        recovery_wallet: z.string().optional(),
        encryption_key: ENC_KEY,
        message: z.string().describe('Signed sign-in message (purpose register).'),
        signature: z.string(),
      },
      outputSchema: {
        merchant_id: z.string(),
        slug: z.string(),
        status: z.literal('pending'),
        docs_to_accept: z.array(doc),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (a: Record<string, unknown>) => {
      try {
        const { message, signature, ...rest } = a;
        const r = await registerWithDocs(
          deps,
          { ...rest, signed: { message, signature } } as never,
          { path: '/mcp shop.merchant.register' },
        );
        return ok(r);
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.accept_terms',
    {
      title: 'Accept merchant documents',
      description:
        'Accept the four merchant documents (merchant-agreement, aup, dpa, refund-framework) by signing the APIbase acceptance message with the merchant wallet. Activates the merchant and returns the mk_live_ API key once.',
      inputSchema: {
        wallet: z.string(),
        doc_hashes: z.array(
          z.object({ doc_id: z.string(), version: z.string(), sha256: z.string() }),
        ),
        message: z.string().describe('The exact acceptance text (see docs/integrator.md).'),
        signature: z.string(),
        method: z.enum(['wallet_signature', 'checkbox+wallet_signature']).optional(),
      },
      outputSchema: {
        status: z.literal('active'),
        api_key: z.string().optional().describe('mk_live_ key, shown once on first activation.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (a: Record<string, unknown>) => {
      try {
        return ok(await acceptTerms(deps, a as never));
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.rotate_key',
    {
      title: 'Rotate merchant API key',
      description:
        'Revoke the Bearer key used for this call and return a fresh mk_live_ key (shown once). Works for deactivated merchants too, so open orders can still be closed.',
      inputSchema: {
        encryption_key: ENC_KEY.optional().describe(
          'Optional: ALSO replace the buyer-data encryption key. New kid, same sig_by_wallet rule as registration. Envelopes sealed to the old kid are not re-encrypted: fetch them first.',
        ),
      },
      outputSchema: { api_key: z.string(), terms_update_pending: banner },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (a: { encryption_key?: z.infer<typeof ENC_KEY> }) => {
      try {
        const m = await bearer(deps, apiKey);
        const api_key = await deps.transaction((tx) =>
          rotateKey(
            { db: tx, redis: deps.redis, now: deps.now },
            m.merchant_id,
            { key_hash: m.key_hash },
            a?.encryption_key,
          ),
        );
        return ok({ api_key, ...(await bannerFor(deps, m.merchant_id)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.deactivate',
    {
      title: 'Deactivate merchant',
      description:
        'Deactivate the storefront (needs orders:write). No new quotes; open orders stay serviceable with existing keys.',
      inputSchema: {},
      outputSchema: { status: z.string(), terms_update_pending: banner },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const m = await bearer(deps, apiKey, 'orders:write');
        const r = await deactivateMerchant(deps, m.merchant_id);
        return ok({ ...r, ...(await bannerFor(deps, m.merchant_id)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.orders_list',
    {
      title: 'List my orders',
      description:
        'Your own orders (needs orders:read), newest first. Filters: state, since (ISO 8601); pass next_cursor back as cursor for the next page.',
      inputSchema: {
        state: z.string().optional(),
        since: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      outputSchema: {
        orders: z.array(z.record(z.unknown())),
        next_cursor: z.string().nullable(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a: Record<string, unknown>) => {
      try {
        const m = await bearer(deps, apiKey, 'orders:read');
        return ok({ ...(await listMerchantOrders(deps, m.merchant_id, a)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.order_confirm',
    {
      title: 'Confirm a paid order',
      description:
        "PAID -> CONFIRMED (needs orders:write); stops the confirm SLA (48 h by default). Repeating is a no-op. Another merchant's order is 404.",
      inputSchema: { order_id: z.string() },
      outputSchema: { order_id: z.string(), state: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (a: { order_id: string }) => {
      try {
        const m = await bearer(deps, apiKey, 'orders:write');
        return ok({ ...(await confirmMerchantOrder(deps, m.merchant_id, a.order_id)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.order_ship',
    {
      title: 'Ship a physical order',
      description:
        'CONFIRMED -> SHIPPED for a physical order (needs orders:write): tracking {carrier, number, url?} and delivery_eta (ISO 8601); stops the ship SLA. Later, call again with delivered_at to mark it DELIVERED (starts the refund window). The buyer sees the tracking in shop.order.get. Repeating is a no-op.',
      inputSchema: {
        order_id: z.string(),
        tracking: z
          .object({ carrier: z.string(), number: z.string(), url: z.string().optional() })
          .optional(),
        delivery_eta: z.string().optional(),
        delivered_at: z.string().optional(),
      },
      outputSchema: {
        order_id: z.string(),
        state: z.string(),
        tracking: z.record(z.unknown()).optional(),
        delivery_eta: z.string().nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (a: {
      order_id: string;
      tracking?: unknown;
      delivery_eta?: string;
      delivered_at?: string;
    }) => {
      try {
        const m = await bearer(deps, apiKey, 'orders:write');
        const { order_id, ...rest } = a;
        return ok({ ...(await shipMerchantOrder(deps, m.merchant_id, order_id, rest)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.order_document',
    {
      title: 'Attach a document to an order',
      description:
        'Attach an https:// link (invoice, receipt) to your order (needs orders:write); the paying buyer sees it in shop.order.get documents.',
      inputSchema: { order_id: z.string(), url: z.string() },
      outputSchema: { order_id: z.string(), url: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (a: { order_id: string; url: string }) => {
      try {
        const m = await bearer(deps, apiKey, 'orders:write');
        return ok({ ...(await addMerchantDocument(deps, m.merchant_id, a.order_id, a.url)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.refund',
    {
      title: 'Register a refund you paid',
      description:
        "Register a refund (needs refunds:write). The refund is YOUR transaction: send USDC back to the payer's wallet on the order's rail, then pass its tx_hash. APIbase only reads the chain and verifies: the transaction is confirmed, pays the payer, value >= amount. Verified: the order goes REFUND_PENDING -> REFUNDED (the refunds reach the order total) or PARTIALLY_REFUNDED (send further refunds until the total); otherwise 422 refund_rejected with the reason and the order is unchanged. More than the order total is 400. The platform fee is not returned. A transaction settles one refund only.",
      inputSchema: { order_id: z.string(), amount: z.string(), tx_hash: z.string() },
      outputSchema: {
        refund_id: z.string(),
        order_id: z.string(),
        state: z.string(),
        status: z.string(),
        verified_amount_usd: z.string(),
        refunded_usd: z.string(),
        order_total_usd: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (a: { order_id: string; amount: string; tx_hash: string }) => {
      try {
        const m = await bearer(deps, apiKey, 'refunds:write');
        return ok({ ...(await merchantRefund(deps, m.merchant_id, a)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.webhook_set',
    {
      title: 'Set a webhook endpoint',
      description: `Register (or update with endpoint_id) an https webhook endpoint for the events you pick (needs webhooks:write): ${WEBHOOK_EVENTS.join(', ')}. The URL must resolve to public addresses only. A new endpoint returns its whsec_ signing secret ONCE. Deliveries are signed (X-APIbase-Signature: t=<unix>,v1=HMAC-SHA256(secret, t.body)); dedupe by order_id. Another merchant's endpoint_id is 404.`,
      inputSchema: {
        url: z.string(),
        events: z.array(z.string()),
        endpoint_id: z.string().optional(),
        rotate_secret: z.boolean().optional(),
      },
      outputSchema: {
        endpoint_id: z.string(),
        url: z.string(),
        events: z.array(z.string()),
        secret: z.string().optional().describe('whsec_<32hex>, shown once'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (a: Record<string, unknown>) => {
      try {
        const m = await bearer(deps, apiKey, 'webhooks:write');
        return ok({ ...(await setWebhook(deps, m.merchant_id, a)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );
  reg.call(
    server,
    'shop.merchant.check',
    {
      title: 'Check the connection',
      description:
        'Connection check for your merchant (any valid key): storefront initialize, tools/list = 6, a quote for the test SKU (voided at once, no payment), a signed webhook ping, and whether a PAID test order exists. Returns status connected|incomplete with per-step status ok|fail|skipped and a code; the public twin (statuses and codes only) is public_url.',
      inputSchema: {},
      outputSchema: {
        status: z.enum(['connected', 'incomplete']),
        steps: z.array(
          z.object({
            name: z.string(),
            status: z.enum(['ok', 'fail', 'skipped']),
            code: z.string().optional(),
            detail: z.string().optional(),
          }),
        ),
        payment_verified: z.boolean(),
        public_url: z.string(),
        mcp_url: z.string(),
        suggested_action: z.string().optional(),
        documentation_url: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async () => {
      try {
        const m = await bearer(deps, apiKey);
        return ok({ ...(await runCheck(deps, m.merchant_id)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );

  reg.call(
    server,
    'shop.merchant.stats',
    {
      title: 'My sales statistics',
      description:
        'Your own sales statistics (needs stats:read), the test SKU excluded: quotes -> paid -> closed, gross/net/fee, average order, refunds, disputes, top-20 products, by rail, by agent (client name/version, user-agent family, 8-char wallet hash prefix), webhook success % and p95, overdue SLA counts, the Base fee receivable (owed, invoiced, open fee invoices). Optional from/to (ISO 8601, default last 30 days, at most 366), group day|week. format=csv returns one row per paid order with tx_hash (payer as hash prefix only). Cached for 60 s.',
      inputSchema: {
        from: z.string().optional(),
        to: z.string().optional(),
        group: z.enum(['day', 'week']).optional(),
        format: z.enum(['json', 'csv']).optional(),
      },
      outputSchema: {
        from: z.string().optional(),
        to: z.string().optional(),
        group: z.string().optional(),
        funnel: z.record(z.unknown()).optional(),
        gross_usd: z.string().optional(),
        fee_usd: z.string().optional(),
        net_usd: z.string().optional(),
        avg_order_usd: z.string().optional(),
        series: z.array(z.record(z.unknown())).optional(),
        refunds: z.record(z.unknown()).optional(),
        disputes: z.record(z.unknown()).optional(),
        top_products: z.array(z.record(z.unknown())).optional(),
        by_rail: z.array(z.record(z.unknown())).optional(),
        by_agent: z.array(z.record(z.unknown())).optional(),
        webhook: z.record(z.unknown()).optional(),
        sla_overdue: z.record(z.unknown()).optional(),
        fee_receivable: z.record(z.unknown()).optional(),
        subscriptions_active: z.number().optional(),
        csv: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a: Record<string, unknown>) => {
      try {
        const m = await bearer(deps, apiKey, 'stats:read');
        return ok({ ...(await getMerchantStats(deps, m.merchant_id, a)) });
      } catch (err) {
        return fail(err, requestId);
      }
    },
  );
}
