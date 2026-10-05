import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ShopAuthError } from '../auth/errors';
import { rotateKey } from '../auth/identity.service';
import { authenticateMerchantKey, type AuthedMerchant } from '../auth/merchant-key.service';
import { termsStatus } from '../auth/terms.guard';
import {
  addMerchantDocument,
  confirmMerchantOrder,
  listMerchantOrders,
} from '../order-lifecycle.service';
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
  'shop.merchant.order_document',
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
      inputSchema: {},
      outputSchema: { api_key: z.string(), terms_update_pending: banner },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const m = await bearer(deps, apiKey);
        const api_key = await deps.transaction((tx) =>
          rotateKey({ db: tx, redis: deps.redis, now: deps.now }, m.merchant_id, {
            key_hash: m.key_hash,
          }),
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
}
