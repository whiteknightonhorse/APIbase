/**
 * T-0740 (SOUKBASE-A16-1109 ruling-1 A-2): partner grants. One wallet signature (purpose grant) gives
 * a registered partner a per-merchant `mk_live_` key limited to catalog:write + webhooks:write. The
 * plaintext key is never returned to the merchant and never logged: it is held encrypted on the
 * linked handoff until the partner reads it there once. The merchant lists and revokes grants.
 * T-0747 (SOUKBASE-A2B-1109 ruling-1, A-2b): the registry entry's `grant_mode` chooses. Mode `key` is the
 * above. Mode `partner` mints no key: the partner writes the catalog with its own partner key (partner
 * routes, live grant required) and the grant creates one grant-owned webhook endpoint at the partner's
 * registered delivery URL, whose `whsec_` secret is parked on the handoff the same one-read way.
 */
import { hashApiKey } from '../../services/api-key.service';
import { encryptSecret } from '../../services/secret-crypto.service';
import { ShopAuthError } from '../auth/errors';
import { issueKey } from '../auth/merchant-key.service';
import { verifyGrantSignature } from '../auth/nonce.service';
import { reasonBlocks } from '../auth/terms.guard';
import type { ShopTx } from '../db';
import type { WebhookDeps } from '../webhook/webhook.service';
import { QuoteError } from '../quote.errors';
import { UUID_RE } from './handoff.service';

export const GRANT_SCOPES = ['catalog:write', 'webhooks:write'] as const;
const DOC = '/integrator/docs#partner-grants';
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const PARTNER_RE = /^[a-z0-9-]{2,40}$/;

export type GrantMode = 'key' | 'partner';

export interface PartnerRef {
  id: string;
  name: string;
  /** T-0747: what a grant gives this partner (registry `grant_mode`). */
  grant_mode: GrantMode;
  /** mode partner only: the grant-owned endpoint's url and events (registry). */
  delivery_webhook_url?: string;
  delivery_events?: string[];
}

/** The partner registry (config/integrator/partners.json), loaded lazily so this module stays light. */
export async function findPartner(id: unknown): Promise<PartnerRef | undefined> {
  if (typeof id !== 'string' || !PARTNER_RE.test(id)) return undefined;
  const { partners } = await import('../routes/integrator.router');
  const p = partners().find((x) => x.id === id);
  if (!p) return undefined;
  return p.grant_mode === 'partner'
    ? {
        id: p.id,
        name: p.name,
        grant_mode: 'partner',
        delivery_webhook_url: p.delivery_webhook_url,
        delivery_events: p.delivery_events ? [...p.delivery_events] : undefined,
      }
    : { id: p.id, name: p.name, grant_mode: 'key' };
}

const invalid = (field: string) =>
  new QuoteError(422, 'validation_failed', `${field} is invalid`, 'fix_request', {
    field,
    documentation_url: DOC,
  });
const notFound = (code: string, message: string) =>
  new QuoteError(404, code, message, 'fix_request', { documentation_url: DOC });

export interface GrantResult {
  grant_id: string;
  partner: string;
  /** T-0747: key = a per-store key went to the partner's handoff; partner = no key, a grant-owned endpoint. */
  mode: GrantMode;
  scopes: string[];
  created_at: string;
  slug: string;
}

/**
 * POST /api/v1/shop/merchants/me/grants (no Bearer: the wallet signature is the credential).
 * One active grant per (merchant, partner). Key (mode key) or grant-owned endpoint (mode partner),
 * grant row and handoff binding in one transaction. The answer never carries a key or a secret.
 */
export async function createGrant(d: WebhookDeps, body: unknown): Promise<GrantResult> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const { wallet, partner, message, signature, handoff_id } = b;
  if (typeof wallet !== 'string' || !ADDR_RE.test(wallet)) throw invalid('wallet');
  const p = await findPartner(partner);
  if (!p) throw invalid('partner');
  if (typeof message !== 'string' || typeof signature !== 'string') {
    throw new ShopAuthError(401, 'wallet signature required', 'sign the grant message');
  }
  await verifyGrantSignature(
    { message, signature, expectedAddress: wallet, partner: p },
    { redis: d.redis, now: d.now },
  );
  const rows = await d.db.$queryRawUnsafe<
    Array<{ merchant_id: string; slug: string; status: string; status_reason: string | null }>
  >(
    `SELECT merchant_id::text AS merchant_id, slug, status, status_reason
       FROM shop_merchants WHERE wallet_address = $1`,
    wallet.toLowerCase(),
  );
  const m = rows[0];
  if (!m) throw notFound('merchant_not_found', 'This wallet has no store on APIbase yet');
  if (m.status !== 'active' || reasonBlocks(m.status_reason)) {
    throw new QuoteError(
      410,
      'merchant_unavailable',
      m.status === 'pending'
        ? 'the store has not accepted the merchant documents yet'
        : 'the store is suspended or deactivated',
      'contact_support',
      { documentation_url: DOC },
    );
  }
  const hid = typeof handoff_id === 'string' && UUID_RE.test(handoff_id) ? handoff_id : null;
  try {
    return await d.transaction(async (tx) => {
      const dup = await tx.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_partner_grants
          WHERE merchant_id = $1::uuid AND partner_id = $2 AND revoked_at IS NULL`,
        m.merchant_id,
        p.id,
      );
      if (dup.length > 0) throw grantExists(p.id);
      const mode: GrantMode = p.grant_mode;
      // mode key: a per-store key; mode partner: none (key_hash NULL, the row CHECK pins it)
      const key =
        mode === 'key' ? await issueKey(tx, m.merchant_id, GRANT_SCOPES, `grant:${p.id}`) : null;
      const g = await tx.$queryRawUnsafe<Array<{ grant_id: string; created_at: Date }>>(
        `INSERT INTO shop_partner_grants (merchant_id, partner_id, key_hash, scopes, mode)
         VALUES ($1::uuid, $2, $3, $4::text[], $5)
         RETURNING grant_id::text AS grant_id, created_at`,
        m.merchant_id,
        p.id,
        key ? hashApiKey(key) : null,
        [...GRANT_SCOPES],
        mode,
      );
      const grant = g[0];
      // mode partner: the grant-owned endpoint at the registry URL. setWebhook's own target check
      // and MAX_ENDPOINTS apply; its 422 fails the whole grant (the transaction rolls back).
      let secret: string | null = null;
      if (mode === 'partner') {
        const { setWebhook } = await import('../webhook/webhook.service');
        const wh = await setWebhook(
          { ...d, db: tx },
          m.merchant_id,
          { url: p.delivery_webhook_url, events: p.delivery_events },
          { grant_id: grant.grant_id },
        );
        secret = wh.secret ?? null;
      }
      if (hid) {
        // lazy: the app config is only needed when a key or secret is parked for the partner
        const { config } = await import('../../config');
        const enc = (v: string | null) => (v ? encryptSecret(v, config.ENCRYPTION_KEY) : null);
        await tx.$executeRawUnsafe(
          `UPDATE shop_partner_handoffs
              SET merchant_id = $3::uuid, slug = $4, grant_id = $5::uuid, grant_key_enc = $6,
                  grant_webhook_secret_enc = $7, state = 'granted', prefill = NULL,
                  wallet_match = COALESCE(wallet_match, expected_wallet IS NULL OR expected_wallet = $8)
            WHERE handoff_id = $1::uuid AND partner_id = $2 AND expires_at > now()
              AND grant_id IS NULL AND (merchant_id IS NULL OR merchant_id = $3::uuid)`,
          hid,
          p.id,
          m.merchant_id,
          m.slug,
          grant.grant_id,
          enc(key),
          enc(secret),
          wallet.toLowerCase(),
        );
      }
      return {
        grant_id: grant.grant_id,
        partner: p.id,
        mode,
        scopes: [...GRANT_SCOPES],
        created_at: new Date(grant.created_at).toISOString(),
        slug: m.slug,
      };
    });
  } catch (e) {
    // the partial unique index lost a race with a concurrent grant of the same partner
    if (/shop_partner_grants_active_uq/.test(String((e as Error)?.message)))
      throw grantExists(p.id);
    throw e;
  }
}

const grantExists = (partner: string) =>
  new QuoteError(
    409,
    'grant_exists',
    `${partner} already has an active grant for this store; revoke it first`,
    'fix_request',
    { documentation_url: DOC },
  );

/** GET /merchants/me/grants: the active grants (with their mode) and the ids of the endpoints each one created. */
export async function listGrants(
  db: ShopTx,
  merchant_id: string,
): Promise<{
  grants: Array<{
    grant_id: string;
    partner: string;
    mode: GrantMode;
    scopes: string[];
    created_at: string;
    endpoints: string[];
  }>;
}> {
  const rows = await db.$queryRawUnsafe<
    Array<{
      grant_id: string;
      partner_id: string;
      mode: GrantMode;
      scopes: string[];
      created_at: Date;
      endpoints: string[];
    }>
  >(
    `SELECT g.grant_id::text AS grant_id, g.partner_id, g.mode, g.scopes, g.created_at,
            COALESCE(array_agg(e.endpoint_id::text ORDER BY e.created_at)
                     FILTER (WHERE e.endpoint_id IS NOT NULL), '{}') AS endpoints
       FROM shop_partner_grants g
       LEFT JOIN shop_webhook_endpoints e ON e.grant_id = g.grant_id AND e.status <> 'deleted'
      WHERE g.merchant_id = $1::uuid AND g.revoked_at IS NULL
      GROUP BY g.grant_id
      ORDER BY g.created_at, g.grant_id`,
    merchant_id,
  );
  return {
    grants: rows.map((r) => ({
      grant_id: r.grant_id,
      partner: r.partner_id,
      mode: r.mode,
      scopes: r.scopes,
      created_at: new Date(r.created_at).toISOString(),
      endpoints: r.endpoints,
    })),
  };
}

/**
 * DELETE /merchants/me/grants/:partner. Must run in a transaction: revokes the grant key, marks the
 * grant revoked, soft-deletes its endpoints (fan-out stops) and drops an undelivered key or webhook
 * secret from the handoff. Unknown or already revoked = 404. A mode-partner grant has no key (NULL
 * key_hash): the key UPDATE matches nothing.
 */
export async function revokeGrant(
  tx: ShopTx,
  merchant_id: string,
  partner: unknown,
): Promise<{ partner: string; revoked: true }> {
  const none = () => notFound('not_found', 'no active grant for this partner');
  if (typeof partner !== 'string' || !PARTNER_RE.test(partner)) throw none();
  const g = await tx.$queryRawUnsafe<Array<{ grant_id: string; key_hash: string }>>(
    `UPDATE shop_partner_grants SET revoked_at = now()
      WHERE merchant_id = $1::uuid AND partner_id = $2 AND revoked_at IS NULL
      RETURNING grant_id::text AS grant_id, key_hash`,
    merchant_id,
    partner,
  );
  if (!g[0]) throw none();
  await revokeGrantEffects(
    tx,
    g.map((r) => r.grant_id),
  );
  return { partner, revoked: true };
}

/** Key revoked, endpoints soft-deleted (T-0727 path), undelivered key or secret dropped from the handoff. */
async function revokeGrantEffects(tx: ShopTx, grant_ids: string[]): Promise<void> {
  if (grant_ids.length === 0) return;
  await tx.$executeRawUnsafe(
    `UPDATE shop_merchant_keys SET revoked_at = now()
      WHERE revoked_at IS NULL
        AND key_hash IN (SELECT key_hash FROM shop_partner_grants WHERE grant_id = ANY($1::uuid[]))`,
    grant_ids,
  );
  await tx.$executeRawUnsafe(
    `UPDATE shop_webhook_endpoints SET status = 'deleted'
      WHERE grant_id = ANY($1::uuid[]) AND status <> 'deleted'`,
    grant_ids,
  );
  await tx.$executeRawUnsafe(
    `UPDATE shop_partner_handoffs SET grant_key_enc = NULL, grant_webhook_secret_enc = NULL
      WHERE grant_id = ANY($1::uuid[])`,
    grant_ids,
  );
}

/**
 * Identity change: every active grant of the merchant goes (it was signed by the old wallet).
 * Lost key (`keepPartnerMode`, T-0801 ruling-1): only the grants of mode `key` go, with their key and
 * endpoints; a grant of mode `partner` holds no merchant key, so it stays with its endpoint and handoff.
 */
export async function revokeAllGrants(
  tx: ShopTx,
  merchant_id: string,
  opts: { keepPartnerMode?: boolean } = {},
): Promise<void> {
  const g = await tx.$queryRawUnsafe<Array<{ grant_id: string }>>(
    `UPDATE shop_partner_grants SET revoked_at = now()
      WHERE merchant_id = $1::uuid AND revoked_at IS NULL
        AND ($2::boolean IS NOT TRUE OR mode <> 'partner')
      RETURNING grant_id::text AS grant_id`,
    merchant_id,
    opts.keepPartnerMode === true,
  );
  await revokeGrantEffects(
    tx,
    g.map((r) => r.grant_id),
  );
}

// ---------------------------------------------------------------------------------------------
// T-0747 (A-2b): the partner's side, authenticated by its own partner key (partner.router.ts).
// Every lookup is `partner_id = <the key's partner> AND merchant_id = <the slug's store>`.
// ---------------------------------------------------------------------------------------------
const PDOC = '/integrator/docs#partner-mode';
const SLUG_RE = /^[a-z0-9-]{3,40}$/;

const storeNotFound = () =>
  new QuoteError(404, 'merchant_not_found', 'no store with this slug', 'fix_request', {
    documentation_url: PDOC,
  });

async function storeBySlug(
  db: ShopTx,
  slug: unknown,
): Promise<{ merchant_id: string; slug: string; status: string }> {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) throw storeNotFound();
  const rows = await db.$queryRawUnsafe<
    Array<{ merchant_id: string; slug: string; status: string }>
  >(
    `SELECT merchant_id::text AS merchant_id, slug, status FROM shop_merchants WHERE slug = $1`,
    slug,
  );
  if (!rows[0]) throw storeNotFound();
  return rows[0];
}

export interface LiveGrant {
  merchant_id: string;
  slug: string;
  /** the store's status (the catalog route refuses an inactive store as /merchants/me/catalog does) */
  status: string;
  grant_id: string;
  mode: GrantMode;
}

/**
 * The live grant of THIS partner for the store `slug`. No grant of this partner ever = 403
 * grant_missing; its latest grant revoked = 403 grant_revoked (with revoked_at). Another partner's
 * grant never counts.
 */
export async function liveGrantFor(
  db: ShopTx,
  partner: { id: string; name: string },
  slug: unknown,
): Promise<LiveGrant> {
  const s = await storeBySlug(db, slug);
  const live = await db.$queryRawUnsafe<Array<{ grant_id: string; mode: GrantMode }>>(
    `SELECT grant_id::text AS grant_id, mode FROM shop_partner_grants
      WHERE partner_id = $1 AND merchant_id = $2::uuid AND revoked_at IS NULL`,
    partner.id,
    s.merchant_id,
  );
  if (live[0]) return { ...s, grant_id: live[0].grant_id, mode: live[0].mode };
  const last = await db.$queryRawUnsafe<Array<{ revoked_at: Date }>>(
    `SELECT revoked_at FROM shop_partner_grants
      WHERE partner_id = $1 AND merchant_id = $2::uuid AND revoked_at IS NOT NULL
      ORDER BY revoked_at DESC LIMIT 1`,
    partner.id,
    s.merchant_id,
  );
  if (last[0]) {
    throw new QuoteError(
      403,
      'grant_revoked',
      `${s.slug} has revoked the grant of ${partner.name}; send the seller a new grant link`,
      'fix_request',
      { revoked_at: new Date(last[0].revoked_at).toISOString(), documentation_url: PDOC },
    );
  }
  throw new QuoteError(
    403,
    'grant_missing',
    `${s.slug} has not allowed ${partner.name}; send the seller a grant link`,
    'fix_request',
    { documentation_url: PDOC },
  );
}

export interface PartnerGrantView {
  grant_id: string;
  partner: string;
  mode: GrantMode;
  state: 'active' | 'revoked';
  scopes: string[];
  signed_at: string;
  revoked_at: string | null;
  webhook?: { endpoint_id: string; url: string; events: string[]; status: string };
}

/**
 * GET /partners/merchants/:slug/grants: this partner's grants for that store (active first, then
 * newest; at most 20). `webhook` (the grant-owned endpoint) only in mode partner. Never a key, a
 * secret, a wallet or an e-mail.
 */
export async function partnerGrants(
  db: ShopTx,
  partner_id: string,
  slug: unknown,
): Promise<{ slug: string; grants: PartnerGrantView[] }> {
  const s = await storeBySlug(db, slug);
  const rows = await db.$queryRawUnsafe<
    Array<{
      grant_id: string;
      partner_id: string;
      mode: GrantMode;
      scopes: string[];
      created_at: Date;
      revoked_at: Date | null;
      endpoint_id: string | null;
      url: string | null;
      events: string[] | null;
      status: string | null;
    }>
  >(
    `SELECT g.grant_id::text AS grant_id, g.partner_id, g.mode, g.scopes, g.created_at, g.revoked_at,
            e.endpoint_id::text AS endpoint_id, e.url, e.events, e.status
       FROM shop_partner_grants g
       LEFT JOIN LATERAL (
              SELECT endpoint_id, url, events, status FROM shop_webhook_endpoints
               WHERE grant_id = g.grant_id ORDER BY created_at, endpoint_id LIMIT 1
            ) e ON g.mode = 'partner'
      WHERE g.partner_id = $1 AND g.merchant_id = $2::uuid
      ORDER BY (g.revoked_at IS NULL) DESC, g.created_at DESC, g.grant_id DESC
      LIMIT 20`,
    partner_id,
    s.merchant_id,
  );
  return {
    slug: s.slug,
    grants: rows.map((r) => ({
      grant_id: r.grant_id,
      partner: r.partner_id,
      mode: r.mode,
      state: r.revoked_at ? 'revoked' : 'active',
      scopes: r.scopes,
      signed_at: new Date(r.created_at).toISOString(),
      revoked_at: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
      ...(r.mode === 'partner' && r.endpoint_id
        ? {
            webhook: {
              endpoint_id: r.endpoint_id,
              url: r.url ?? '',
              events: r.events ?? [],
              status: r.status ?? '',
            },
          }
        : {}),
    })),
  };
}

/**
 * POST /partners/merchants/:slug/webhook/rotate-secret: a live mode-partner grant only. Re-applies the
 * registry url/events to the grant-owned endpoint and returns a new secret once. Mode key, or an
 * endpoint the merchant deleted (T-0727), = 404.
 */
export async function rotatePartnerWebhookSecret(
  d: WebhookDeps,
  partner: PartnerRef,
  slug: unknown,
): Promise<{ endpoint_id: string; url: string; events: string[]; secret: string }> {
  const g = await liveGrantFor(d.db, partner, slug);
  if (g.mode !== 'partner' || partner.grant_mode !== 'partner') {
    throw new QuoteError(
      404,
      'not_found',
      'no partner-mode webhook for this store',
      'fix_request',
      {
        documentation_url: PDOC,
      },
    );
  }
  const ep = await d.db.$queryRawUnsafe<Array<{ endpoint_id: string }>>(
    `SELECT endpoint_id::text AS endpoint_id FROM shop_webhook_endpoints
      WHERE grant_id = $1::uuid AND merchant_id = $2::uuid AND status <> 'deleted'
      ORDER BY created_at, endpoint_id LIMIT 1`,
    g.grant_id,
    g.merchant_id,
  );
  if (!ep[0]) {
    throw new QuoteError(404, 'not_found', 'webhook endpoint not found', 'fix_request', {
      documentation_url: PDOC,
    });
  }
  const { setWebhook } = await import('../webhook/webhook.service');
  const r = await setWebhook(
    d,
    g.merchant_id,
    {
      endpoint_id: ep[0].endpoint_id,
      url: partner.delivery_webhook_url,
      events: partner.delivery_events,
      rotate_secret: true,
    },
    { grant_id: g.grant_id },
  );
  return { endpoint_id: r.endpoint_id, url: r.url, events: r.events, secret: r.secret ?? '' };
}
