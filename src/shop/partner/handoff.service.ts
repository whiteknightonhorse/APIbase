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
export interface HandoffInput {
  seller_ref: string | null;
  prefill: Prefill | null;
  expected_wallet: string | null;
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

export function validateHandoffInput(body: unknown): HandoffInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    throw new HandoffValidationError('body');
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b))
    if (!['seller_ref', 'prefill', 'expected_wallet'].includes(k))
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
      if (!Object.prototype.hasOwnProperty.call(PREFILL_RULES, k))
        throw new HandoffValidationError(`prefill.${k}`);
      const rule = PREFILL_RULES[k as keyof Prefill];
      if (typeof v !== 'string' || !rule(v)) throw new HandoffValidationError(`prefill.${k}`);
      out[k as keyof Prefill] = v;
    }
    prefill = Object.keys(out).length > 0 ? out : null;
  }
  let expected_wallet: string | null = null;
  if (b.expected_wallet !== undefined && b.expected_wallet !== null) {
    if (typeof b.expected_wallet !== 'string' || !ADDR_RE.test(b.expected_wallet))
      throw new HandoffValidationError('expected_wallet');
    expected_wallet = b.expected_wallet.toLowerCase();
  }
  return { seller_ref, prefill, expected_wallet };
}

export async function createHandoff(
  db: ShopTx,
  partner_id: string,
  input: HandoffInput,
): Promise<{ handoff_id: string; url: string; expires_at: string }> {
  const rows = await db.$queryRawUnsafe<Array<{ handoff_id: string; expires_at: Date }>>(
    `INSERT INTO shop_partner_handoffs (partner_id, seller_ref, prefill, expected_wallet)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING handoff_id::text, expires_at`,
    partner_id,
    input.seller_ref,
    input.prefill ? JSON.stringify(input.prefill) : null,
    input.expected_wallet,
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
  state: 'created' | 'opened' | 'registered';
  seller_ref: string | null;
  slug: string | null;
  merchant_id: string | null;
  wallet_match: boolean | null;
  created_at: Date;
  expires_at: Date;
  opened_at: Date | null;
  registered_at: Date | null;
  expired: boolean;
}

/** The partner's view: never the prefill, a merchant key, the wallet or the e-mail. Another partner's id = null. */
export async function readHandoff(
  db: ShopTx,
  partner_id: string,
  handoff_id: unknown,
): Promise<Record<string, unknown> | null> {
  if (typeof handoff_id !== 'string' || !UUID_RE.test(handoff_id)) return null;
  const rows = await db.$queryRawUnsafe<HandoffRow[]>(
    `SELECT handoff_id::text, state, seller_ref, slug, merchant_id::text, wallet_match, created_at,
            expires_at, opened_at, registered_at, (expires_at <= now()) AS expired
       FROM shop_partner_handoffs WHERE handoff_id = $1::uuid AND partner_id = $2`,
    handoff_id,
    partner_id,
  );
  const r = rows[0];
  if (!r) return null;
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : undefined);
  const out: Record<string, unknown> = {
    handoff_id: r.handoff_id,
    state: r.state !== 'registered' && r.expired ? 'expired' : r.state,
    seller_ref: r.seller_ref,
  };
  if (r.slug !== null) out.slug = r.slug;
  if (r.merchant_id !== null) out.merchant_id = r.merchant_id;
  if (r.wallet_match !== null) out.wallet_match = r.wallet_match;
  out.created_at = iso(r.created_at);
  out.expires_at = iso(r.expires_at);
  if (r.opened_at) out.opened_at = iso(r.opened_at);
  if (r.registered_at) out.registered_at = iso(r.registered_at);
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
): Promise<{ handoff_id: string; prefill: Prefill | null; expected_wallet: string | null } | null> {
  if (typeof handoff_id !== 'string' || !UUID_RE.test(handoff_id)) return null;
  const rows = await db.$queryRawUnsafe<
    Array<{ handoff_id: string; prefill: Prefill | null; expected_wallet: string | null }>
  >(
    `UPDATE shop_partner_handoffs
        SET state = 'opened', opened_at = COALESCE(opened_at, now())
      WHERE handoff_id = $1::uuid AND partner_id = $2
        AND state IN ('created', 'opened') AND expires_at > now()
      RETURNING handoff_id::text, prefill, expected_wallet`,
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
