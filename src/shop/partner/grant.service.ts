/**
 * T-0740 (SOUKBASE-A16-1109 ruling-1 A-2): partner grants. One wallet signature (purpose grant) gives
 * a registered partner a per-merchant `mk_live_` key limited to catalog:write + webhooks:write. The
 * plaintext key is never returned to the merchant and never logged: it is held encrypted on the
 * linked handoff until the partner reads it there once. The merchant lists and revokes grants.
 */
import { hashApiKey } from '../../services/api-key.service';
import { encryptSecret } from '../../services/secret-crypto.service';
import { ShopAuthError } from '../auth/errors';
import { issueKey } from '../auth/merchant-key.service';
import { verifyGrantSignature } from '../auth/nonce.service';
import { reasonBlocks } from '../auth/terms.guard';
import type { ShopTx } from '../db';
import type { ShopDeps } from '../merchant-lifecycle.service';
import { QuoteError } from '../quote.errors';
import { UUID_RE } from './handoff.service';

export const GRANT_SCOPES = ['catalog:write', 'webhooks:write'] as const;
const DOC = '/integrator/docs#partner-grants';
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const PARTNER_RE = /^[a-z0-9-]{2,40}$/;

export interface PartnerRef {
  id: string;
  name: string;
}

/** The partner registry (config/integrator/partners.json), loaded lazily so this module stays light. */
export async function findPartner(id: unknown): Promise<PartnerRef | undefined> {
  if (typeof id !== 'string' || !PARTNER_RE.test(id)) return undefined;
  const { partners } = await import('../routes/integrator.router');
  const p = partners().find((x) => x.id === id);
  return p ? { id: p.id, name: p.name } : undefined;
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
  scopes: string[];
  created_at: string;
  slug: string;
}

/**
 * POST /api/v1/shop/merchants/me/grants (no Bearer: the wallet signature is the credential).
 * One active grant per (merchant, partner). Key, grant row and handoff binding in one transaction.
 */
export async function createGrant(d: ShopDeps, body: unknown): Promise<GrantResult> {
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
      const key = await issueKey(tx, m.merchant_id, GRANT_SCOPES, `grant:${p.id}`);
      const g = await tx.$queryRawUnsafe<Array<{ grant_id: string; created_at: Date }>>(
        `INSERT INTO shop_partner_grants (merchant_id, partner_id, key_hash, scopes)
         VALUES ($1::uuid, $2, $3, $4::text[])
         RETURNING grant_id::text AS grant_id, created_at`,
        m.merchant_id,
        p.id,
        hashApiKey(key),
        [...GRANT_SCOPES],
      );
      const grant = g[0];
      if (hid) {
        // lazy: the app config is only needed when a key is parked for the partner
        const { config } = await import('../../config');
        await tx.$executeRawUnsafe(
          `UPDATE shop_partner_handoffs
              SET merchant_id = $3::uuid, slug = $4, grant_id = $5::uuid, grant_key_enc = $6,
                  state = 'granted', prefill = NULL
            WHERE handoff_id = $1::uuid AND partner_id = $2 AND expires_at > now()
              AND grant_id IS NULL AND (merchant_id IS NULL OR merchant_id = $3::uuid)`,
          hid,
          p.id,
          m.merchant_id,
          m.slug,
          grant.grant_id,
          encryptSecret(key, config.ENCRYPTION_KEY),
        );
      }
      return {
        grant_id: grant.grant_id,
        partner: p.id,
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

/** GET /merchants/me/grants: the active grants with the ids of the endpoints each one created. */
export async function listGrants(
  db: ShopTx,
  merchant_id: string,
): Promise<{
  grants: Array<{
    grant_id: string;
    partner: string;
    scopes: string[];
    created_at: string;
    endpoints: string[];
  }>;
}> {
  const rows = await db.$queryRawUnsafe<
    Array<{
      grant_id: string;
      partner_id: string;
      scopes: string[];
      created_at: Date;
      endpoints: string[];
    }>
  >(
    `SELECT g.grant_id::text AS grant_id, g.partner_id, g.scopes, g.created_at,
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
      scopes: r.scopes,
      created_at: new Date(r.created_at).toISOString(),
      endpoints: r.endpoints,
    })),
  };
}

/**
 * DELETE /merchants/me/grants/:partner. Must run in a transaction: revokes the grant key, marks the
 * grant revoked, soft-deletes its endpoints (fan-out stops) and drops an undelivered key from the
 * handoff. Unknown or already revoked = 404.
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

/** Key revoked, endpoints soft-deleted (T-0727 path), undelivered key dropped from the handoff. */
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
    `UPDATE shop_partner_handoffs SET grant_key_enc = NULL WHERE grant_id = ANY($1::uuid[])`,
    grant_ids,
  );
}

/** Lost key or identity change (all keys revoked): every active grant of the merchant goes too. */
export async function revokeAllGrants(tx: ShopTx, merchant_id: string): Promise<void> {
  const g = await tx.$queryRawUnsafe<Array<{ grant_id: string }>>(
    `UPDATE shop_partner_grants SET revoked_at = now()
      WHERE merchant_id = $1::uuid AND revoked_at IS NULL RETURNING grant_id::text AS grant_id`,
    merchant_id,
  );
  await revokeGrantEffects(
    tx,
    g.map((r) => r.grant_id),
  );
}
