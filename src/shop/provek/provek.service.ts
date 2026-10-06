import type { ShopDeps } from '../merchant-lifecycle.service';
import type { ShopTx } from '../db';
import { mcpUrl, PUBLIC_BASE } from '../storefront/storefront.service';

/**
 * A3-9: the optional Provek declaration. `shop_merchants.provek` (0027) holds
 * `{opt_in, insurance?, claims_url?, listed, registry_url}`. Everything public is derived from it
 * through the functions below: `contact_email` is never selected into any of these shapes.
 */
export const PROVEK_REGISTRY_URL = 'https://provek.dev/data/registry.json';
export const PROVEK_DECLARATION_VERSION = '1.1.0';
/** SG-15: the owner relationship is disclosed next to every mention of Provek. */
export const PROVEK_DISCLOSURE =
  'Provek and APIbase belong to the same owner; the assessment is not independent.';

const NOTE_MAX = 140;
const URL_MAX = 2000;

export interface ProvekStored {
  opt_in: boolean;
  insurance?: { exists: boolean; note?: string };
  claims_url?: string;
  listed?: boolean;
  registry_url?: string | null;
}

/** Public `provek {declared, listed, registry_url}`. */
export interface ProvekPublic {
  declared: boolean;
  listed: boolean;
  registry_url: string | null;
}

export class ProvekInputError extends Error {}

export const provekPublic = (p: ProvekStored | null | undefined): ProvekPublic => {
  const declared = p?.opt_in === true;
  const listed = declared && p?.listed === true;
  return {
    declared,
    listed,
    registry_url: listed && typeof p?.registry_url === 'string' ? p.registry_url : null,
  };
};

/** Present on public cards only for a merchant that opted in. */
export const provekIfDeclared = (p: ProvekStored | null | undefined): ProvekPublic | undefined =>
  p?.opt_in === true ? provekPublic(p) : undefined;

/** Validates the PATCH body; unknown keys are rejected so nothing unreviewed is stored. */
export function parseProvekPatch(raw: unknown): {
  opt_in: boolean;
  insurance?: { exists: boolean; note?: string };
  claims_url?: string;
} {
  const b = raw as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) {
    throw new ProvekInputError('body must be an object');
  }
  for (const k of Object.keys(b)) {
    if (!['opt_in', 'insurance', 'claims_url'].includes(k)) {
      throw new ProvekInputError(`unknown field "${k}"`);
    }
  }
  if (typeof b.opt_in !== 'boolean') throw new ProvekInputError('opt_in (boolean) is required');
  const out: ReturnType<typeof parseProvekPatch> = { opt_in: b.opt_in };
  if (b.insurance !== undefined) {
    const i = b.insurance as Record<string, unknown> | null;
    if (!i || typeof i !== 'object' || typeof i.exists !== 'boolean') {
      throw new ProvekInputError('insurance must be {exists: boolean, note?: string}');
    }
    if (i.note !== undefined && (typeof i.note !== 'string' || i.note.length > NOTE_MAX)) {
      throw new ProvekInputError(
        `insurance.note must be a string of at most ${NOTE_MAX} characters`,
      );
    }
    out.insurance = {
      exists: i.exists,
      ...(i.note !== undefined ? { note: i.note as string } : {}),
    };
  }
  if (b.claims_url !== undefined) {
    let u: URL | undefined;
    try {
      u = typeof b.claims_url === 'string' ? new URL(b.claims_url) : undefined;
    } catch {
      u = undefined;
    }
    if (!u || u.protocol !== 'https:' || u.username || u.password) {
      throw new ProvekInputError('claims_url must be an absolute https:// URL');
    }
    if ((b.claims_url as string).length > URL_MAX) {
      throw new ProvekInputError(`claims_url is longer than ${URL_MAX} characters`);
    }
    out.claims_url = b.claims_url as string;
  }
  return out;
}

/**
 * `PATCH /merchants/me/provek`: the merchant comes from the key, never from the body. Registry
 * fields (`listed`, `registry_url`) are owned by the sync job and survive a PATCH while opted in;
 * opting out clears them.
 */
export async function patchProvek(
  d: Pick<ShopDeps, 'db'>,
  merchant_id: string,
  body: unknown,
): Promise<{ provek: ProvekPublic }> {
  const p = parseProvekPatch(body);
  const rows = await d.db.$queryRawUnsafe<Array<{ provek: ProvekStored | null }>>(
    `SELECT provek FROM shop_merchants WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  const prev = rows[0]?.provek ?? null;
  const next: ProvekStored = p.opt_in
    ? {
        opt_in: true,
        ...(p.insurance ? { insurance: p.insurance } : {}),
        ...(p.claims_url ? { claims_url: p.claims_url } : {}),
        listed: prev?.listed === true,
        registry_url: prev?.registry_url ?? null,
      }
    : { opt_in: false, listed: false, registry_url: null };
  await d.db.$executeRawUnsafe(
    `UPDATE shop_merchants SET provek = $2::jsonb WHERE merchant_id = $1::uuid`,
    merchant_id,
    JSON.stringify(next),
  );
  return { provek: provekPublic(next) };
}

export interface DeclarationShop {
  slug: string;
  name: string;
  category: string;
  site_url: string;
}

/** The public `/m/<slug>/provek.json` document (provek_declaration 1.1.0). */
export function buildDeclaration(shop: DeclarationShop, p: ProvekStored) {
  const insurance = p.insurance?.exists
    ? { exists: true, ...(p.insurance.note ? { note: p.insurance.note } : {}) }
    : { exists: false };
  return {
    provek_declaration: PROVEK_DECLARATION_VERSION,
    accountability: {
      claims_addressee: { type: 'website', contact: p.claims_url ?? shop.site_url },
      emergency_stop: {
        exists: true,
        holder: 'merchant',
        mechanism: 'shop.merchant.deactivate → storefront 410',
      },
      insurance,
      dispute_path: { type: 'url', url: `${PUBLIC_BASE}/m/${shop.slug}#disputes` },
    },
    service: {
      order_url: mcpUrl(shop.slug),
      offering: `${shop.name}: ${shop.category} via APIbase AI payment`,
      pricing_url: `${PUBLIC_BASE}/m/${shop.slug}`,
    },
    operated_via: { platform: 'APIbase', same_owner_as_provek: true },
  };
}

/**
 * Evidence aggregates for `/api/v1/shop/shops/:slug/evidence.json`. Reads only the merchant's own
 * published columns and a settled-order aggregate: no wallets, e-mail, or order identifiers.
 */
export async function loadEvidence(
  db: ShopTx,
  slug: string,
  connected: (merchant_id: string) => Promise<{ connected: boolean; payment_verified: boolean }>,
  now: Date,
) {
  const rows = await db.$queryRawUnsafe<
    Array<{
      merchant_id: string;
      status: string;
      domain_verified: boolean;
      reputation: Record<string, unknown> | null;
      created_at: Date;
      provek: ProvekStored | null;
    }>
  >(
    `SELECT merchant_id, status, domain_verified, reputation, created_at, provek
       FROM shop_merchants WHERE slug = $1`,
    slug,
  );
  const m = rows[0];
  if (!m) return { gone: false as const, missing: true as const };
  if (m.status === 'pending') return { gone: false as const, missing: true as const };
  if (m.status !== 'active') return { gone: true as const, missing: false as const };
  const rep = m.reputation ?? {};
  const c = await connected(m.merchant_id);
  return {
    gone: false as const,
    missing: false as const,
    body: {
      slug,
      as_of: now.toISOString(),
      reputation: {
        closed_on_time_pct: rep.closed_on_time_pct ?? null,
        dispute_rate: rep.dispute_rate ?? null,
        refund_rate: rep.refund_rate ?? null,
        orders_closed: rep.orders_closed ?? 0,
      },
      domain_verified: m.domain_verified,
      connected: c.connected,
      payment_verified: c.payment_verified,
      active_since: new Date(m.created_at).toISOString(),
      rails: ['x402', 'mpp'],
      provek: provekPublic(m.provek),
    },
  };
}
