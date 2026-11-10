/**
 * T-0739 (SOUKBASE-A16-1109 ruling-1 A-1): partner handoffs. A registered partner creates a handoff
 * (prefill + the wallet it expects), the connect page is prefilled from it, registration binds it,
 * the partner reads its state. The prefill is a bearer secret of the link: it is never read back to
 * the partner, nulled on registration and by the sweeper once the handoff expires (24 h).
 */
import type { ShopTx } from '../db';
import { ALLOWED_CATEGORIES } from '../moderation/categories';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const SLUG_RE = /^[a-z0-9-]{3,40}$/;
export const HANDOFF_RETENTION_DAYS = 30;
const CONNECT_URL = 'https://apibase.pro/integrator/connect';

export interface Prefill {
  name?: string;
  site_url?: string;
  contact_email?: string;
  category?: string;
  country?: string;
  slug?: string;
}
export type HandoffMode = 'register' | 'grant';
export interface HandoffInput {
  seller_ref: string | null;
  prefill: Prefill | null;
  expected_wallet: string | null;
  /** T-0740: `grant` = a store already on APIbase only signs the grant; `register` (default) connects first. */
  mode: HandoffMode;
  /** T-0740: in mode register, ask for the grant as a fourth signature after the documents. */
  grant_requested: boolean;
}

/** 422 validation_failed naming the field. */
export class HandoffValidationError extends Error {
  constructor(readonly field: string) {
    super(`${field} is invalid`);
    this.name = 'HandoffValidationError';
  }
}

const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

/** Prefill fields follow the register rules; slug availability is not checked (slug_taken stays a register error). */
const PREFILL_RULES: Record<keyof Prefill, (v: string) => boolean> = {
  name: (v) => v.trim().length >= 1 && v.length <= 120,
  site_url: isHttps,
  contact_email: (v) => EMAIL_RE.test(v),
  category: (v) => ALLOWED_CATEGORIES.includes(v),
  country: (v) => /^[A-Z]{2}$/.test(v),
  slug: (v) => SLUG_RE.test(v),
};

const PREFILL_KEYS = Object.keys(PREFILL_RULES) as Array<keyof Prefill>;

export function validateHandoffInput(body: unknown): HandoffInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    throw new HandoffValidationError('body');
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b))
    if (!['seller_ref', 'prefill', 'expected_wallet', 'mode', 'grant_requested'].includes(k))
      throw new HandoffValidationError(k);
  let seller_ref: string | null = null;
  if (b.seller_ref !== undefined && b.seller_ref !== null) {
    if (typeof b.seller_ref !== 'string' || !b.seller_ref || b.seller_ref.length > 128)
      throw new HandoffValidationError('seller_ref');
    seller_ref = b.seller_ref;
  }
  let prefill: Prefill | null = null;
  if (b.prefill !== undefined && b.prefill !== null) {
    if (typeof b.prefill !== 'object' || Array.isArray(b.prefill))
      throw new HandoffValidationError('prefill');
    const p = b.prefill as Record<string, unknown>;
    const out: Prefill = {};
    for (const [k, v] of Object.entries(p)) {
      const key = PREFILL_KEYS.find((x) => x === k);
      if (key === undefined) throw new HandoffValidationError('prefill.' + k);
      if (typeof v !== 'string' || !PREFILL_RULES[key](v))
        throw new HandoffValidationError('prefill.' + key);
      out[key] = v;
    }
    prefill = Object.keys(out).length > 0 ? out : null;
  }
  let expected_wallet: string | null = null;
  if (b.expected_wallet !== undefined && b.expected_wallet !== null) {
    if (typeof b.expected_wallet !== 'string' || !ADDR_RE.test(b.expected_wallet))
      throw new HandoffValidationError('expected_wallet');
    expected_wallet = b.expected_wallet.toLowerCase();
  }
  let mode: HandoffMode = 'register';
  if (b.mode !== undefined && b.mode !== null) {
    if (b.mode !== 'register' && b.mode !== 'grant') throw new HandoffValidationError('mode');
    mode = b.mode;
  }
  let grant_requested = false;
  if (b.grant_requested !== undefined && b.grant_requested !== null) {
    if (typeof b.grant_requested !== 'boolean') throw new HandoffValidationError('grant_requested');
    grant_requested = b.grant_requested;
  }
  return { seller_ref, prefill, expected_wallet, mode, grant_requested };
}

export async function createHandoff(
  db: ShopTx,
  partner_id: string,
  input: HandoffInput,
): Promise<{ handoff_id: string; url: string; expires_at: string }> {
  const rows = await db.$queryRawUnsafe<Array<{ handoff_id: string; expires_at: Date }>>(
    `INSERT INTO shop_partner_handoffs
       (partner_id, seller_ref, prefill, expected_wallet, mode, grant_requested)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING handoff_id::text, expires_at`,
    partner_id,
    input.seller_ref,
    input.prefill ? JSON.stringify(input.prefill) : null,
    input.expected_wallet,
    input.mode ?? 'register',
    input.grant_requested ?? false,
  );
  const r = rows[0];
  return {
    handoff_id: r.handoff_id,
    url: `${CONNECT_URL}?from=${encodeURIComponent(partner_id)}&handoff=${r.handoff_id}`,
    expires_at: new Date(r.expires_at).toISOString(),
  };
}

interface HandoffRow {
  handoff_id: string;
  state: 'created' | 'opened' | 'registered' | 'granted';
  seller_ref: string | null;
  slug: string | null;
  merchant_id: string | null;
  wallet_match: boolean | null;
  created_at: Date;
  expires_at: Date;
  opened_at: Date | null;
  registered_at: Date | null;
  expired: boolean;
  grant_id: string | null;
  grant_revoked: boolean | null;
  grant_scopes: string[] | null;
  grant_mode: 'key' | 'partner' | null;
  grant_delivered: boolean;
}

/**
 * The partner's view: never the prefill, the wallet or the e-mail. Another partner's id = null.
 * T-0740: `grant` carries the partner's grant key in exactly ONE answer (`decrypt`): the read that
 * takes it NULLs grant_key_enc and stamps grant_delivered_at in the same statement.
 * T-0747: `grant.mode` says which parcel: `key` (mode key, grant_key_enc) or `webhook_secret` (mode
 * partner, grant_webhook_secret_enc: the secret of the grant-owned endpoint). Same one-read rule.
 */
export async function readHandoff(
  db: ShopTx,
  partner_id: string,
  handoff_id: unknown,
  decrypt?: (enc: string) => string,
): Promise<Record<string, unknown> | null> {
  if (typeof handoff_id !== 'string' || !UUID_RE.test(handoff_id)) return null;
  // Take the parked parcel (if any) atomically: a concurrent read sees NULL and gets nothing.
  const taken = await db.$queryRawUnsafe<Array<{ enc: string | null; wenc: string | null }>>(
    `UPDATE shop_partner_handoffs h
        SET grant_key_enc = NULL, grant_webhook_secret_enc = NULL, grant_delivered_at = now()
       FROM (SELECT handoff_id, grant_key_enc AS enc, grant_webhook_secret_enc AS wenc
               FROM shop_partner_handoffs
              WHERE handoff_id = $1::uuid AND partner_id = $2
                AND (grant_key_enc IS NOT NULL OR grant_webhook_secret_enc IS NOT NULL)
              FOR UPDATE) old
      WHERE h.handoff_id = old.handoff_id
      RETURNING old.enc, old.wenc`,
    handoff_id,
    partner_id,
  );
  const rows = await db.$queryRawUnsafe<HandoffRow[]>(
    `SELECT h.handoff_id::text, h.state, h.seller_ref, h.slug, h.merchant_id::text, h.wallet_match,
            h.created_at, h.expires_at, h.opened_at, h.registered_at, (h.expires_at <= now()) AS expired,
            h.grant_id::text AS grant_id, (g.revoked_at IS NOT NULL) AS grant_revoked,
            g.scopes AS grant_scopes, g.mode AS grant_mode,
            (h.grant_delivered_at IS NOT NULL) AS grant_delivered
       FROM shop_partner_handoffs h LEFT JOIN shop_partner_grants g ON g.grant_id = h.grant_id
      WHERE h.handoff_id = $1::uuid AND h.partner_id = $2`,
    handoff_id,
    partner_id,
  );
  const r = rows[0];
  if (!r) return null;
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : undefined);
  const out: Record<string, unknown> = {
    handoff_id: r.handoff_id,
    state: r.state !== 'registered' && r.state !== 'granted' && r.expired ? 'expired' : r.state,
    seller_ref: r.seller_ref,
  };
  if (r.slug !== null) out.slug = r.slug;
  if (r.merchant_id !== null) out.merchant_id = r.merchant_id;
  if (r.wallet_match !== null) out.wallet_match = r.wallet_match;
  out.created_at = iso(r.created_at);
  out.expires_at = iso(r.expires_at);
  if (r.opened_at) out.opened_at = iso(r.opened_at);
  if (r.registered_at) out.registered_at = iso(r.registered_at);
  if (!r.grant_id) out.grant = { state: 'none' };
  else if (r.grant_revoked) out.grant = { state: 'revoked', mode: r.grant_mode };
  else {
    const g: Record<string, unknown> = {
      state: 'granted',
      mode: r.grant_mode,
      scopes: r.grant_scopes ?? [],
    };
    const t = taken[0];
    if (t && decrypt && t.enc) g.key = decrypt(t.enc);
    else if (t && decrypt && t.wenc) g.webhook_secret = decrypt(t.wenc);
    else if (r.grant_delivered) g.delivered = true;
    out.grant = g;
  }
  return out;
}

/**
 * Connect page: a live handoff of this partner (unexpired, created|opened) turns opened (opened_at
 * set once) and yields what the page prefills. Anything else = null.
 */
export async function openHandoff(
  db: ShopTx,
  partner_id: string,
  handoff_id: unknown,
): Promise<{
  handoff_id: string;
  prefill: Prefill | null;
  expected_wallet: string | null;
  mode: HandoffMode;
  grant_requested: boolean;
} | null> {
  if (typeof handoff_id !== 'string' || !UUID_RE.test(handoff_id)) return null;
  const rows = await db.$queryRawUnsafe<
    Array<{
      handoff_id: string;
      prefill: Prefill | null;
      expected_wallet: string | null;
      mode: HandoffMode;
      grant_requested: boolean;
    }>
  >(
    `UPDATE shop_partner_handoffs
        SET state = 'opened', opened_at = COALESCE(opened_at, now())
      WHERE handoff_id = $1::uuid AND partner_id = $2
        AND state IN ('created', 'opened') AND expires_at > now()
      RETURNING handoff_id::text, prefill, expected_wallet, mode, grant_requested`,
    handoff_id,
    partner_id,
  );
  return rows[0] ?? null;
}

/**
 * Registration binds a live handoff (called right after the merchant insert). Returns false when
 * the handoff is unknown, expired or already registered: the registration still succeeds.
 */
export async function bindHandoff(
  db: ShopTx,
  handoff_id: string,
  merchant_id: string,
  slug: string,
  wallet: string,
): Promise<boolean> {
  const n = await db.$executeRawUnsafe(
    `UPDATE shop_partner_handoffs
        SET state = 'registered', merchant_id = $2::uuid, slug = $3,
            wallet_match = (expected_wallet IS NULL OR expected_wallet = lower($4)),
            registered_at = now(), prefill = NULL
      WHERE handoff_id = $1::uuid AND state IN ('created', 'opened') AND expires_at > now()`,
    handoff_id,
    merchant_id,
    slug,
    wallet,
  );
  return n > 0;
}

/** Sweeper: the prefill lives at most 24 h; rows go after 30 days. */
export async function sweepHandoffs(
  db: ShopTx,
  now: Date,
): Promise<{ prefill_nulled: number; deleted: number }> {
  const prefill_nulled = await db.$executeRawUnsafe(
    `UPDATE shop_partner_handoffs SET prefill = NULL WHERE expires_at < $1::timestamptz AND prefill IS NOT NULL`,
    now,
  );
  const deleted = await db.$executeRawUnsafe(
    `DELETE FROM shop_partner_handoffs WHERE created_at < $1::timestamptz - ($2::int * interval '1 day')`,
    now,
    HANDOFF_RETENTION_DAYS,
  );
  return { prefill_nulled, deleted };
}
