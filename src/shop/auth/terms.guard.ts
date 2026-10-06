import type { SuggestedAction } from '../../types/errors';
import type { ShopTx } from '../db';

/** The four documents a merchant accepts to go live (§11.2), in message order. */
export const REQUIRED_DOCS = ['merchant-agreement', 'aup', 'dpa', 'refund-framework'] as const;
export const REACCEPT_WINDOW_MS = 30 * 24 * 3600 * 1000;

export interface LegalDoc {
  doc_id: string;
  version: string;
  sha256: string;
  url: string;
  effective_from: string;
}

export interface GuardMerchant {
  merchant_id: string;
  status: string;
  status_reason?: string | null;
}

/** HTTP-shaped refusal of the shop gate: 428 terms_not_accepted / 410 merchant_unavailable. */
export class ShopGateError extends Error {
  constructor(
    readonly status: 410 | 428,
    readonly error_code: 'terms_not_accepted' | 'merchant_unavailable',
    message: string,
    readonly suggested_action: SuggestedAction,
    readonly documentation_url: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ShopGateError';
  }
}

export const termsNotAccepted = (docs: LegalDoc[]) =>
  new ShopGateError(
    428,
    'terms_not_accepted',
    'accept the current merchant documents first',
    'fix_request',
    '/docs/integrator#terms_not_accepted',
    { docs: docs.map(docView) },
  );

/** `status_reason` values that restrict one rail only (T-INT-25): they never take the shop offline. */
export const RAIL_ONLY_REASONS: readonly string[] = ['fee_overdue_base_off'];

/** True when `status_reason` takes the whole shop offline (410). */
export const reasonBlocks = (reason: string | null | undefined): boolean =>
  !!reason && !RAIL_ONLY_REASONS.includes(reason);

export const merchantUnavailable = () =>
  new ShopGateError(
    410,
    'merchant_unavailable',
    'unavailable',
    'use_different_tool',
    '/legal/refund-framework',
    { policy_url: '/legal/refund-framework' },
  );

const docView = (d: LegalDoc) => ({
  doc_id: d.doc_id,
  version: d.version,
  sha256: d.sha256,
  url: d.url,
});

/** Latest (effective_from <= now) version of each required document, in REQUIRED_DOCS order. */
export async function currentDocs(db: ShopTx, now: number = Date.now()): Promise<LegalDoc[]> {
  const rows = await db.$queryRawUnsafe<LegalDoc[]>(
    `SELECT DISTINCT ON (doc_id) doc_id, version, sha256, url, effective_from
       FROM shop_legal_docs
      WHERE doc_id = ANY($1::text[]) AND effective_from <= $2::timestamptz
      ORDER BY doc_id, effective_from DESC`,
    [...REQUIRED_DOCS],
    new Date(now).toISOString(),
  );
  return REQUIRED_DOCS.map((id) => rows.find((r) => r.doc_id === id)).filter(
    (d): d is LegalDoc => !!d,
  );
}

/** Documents whose latest version this merchant has not accepted, split by the 30-day window. */
export async function termsStatus(
  db: ShopTx,
  merchant_id: string,
  now: number = Date.now(),
): Promise<{ docs: LegalDoc[]; pending: LegalDoc[]; overdue: LegalDoc[] }> {
  const docs = await currentDocs(db, now);
  const acc = await db.$queryRawUnsafe<Array<{ doc_id: string; version: string; sha256: string }>>(
    `SELECT doc_id, version, sha256 FROM shop_acceptances WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  const missing = docs.filter(
    (d) =>
      !acc.some((a) => a.doc_id === d.doc_id && a.version === d.version && a.sha256 === d.sha256),
  );
  const fresh = (d: LegalDoc) => now - Date.parse(d.effective_from) <= REACCEPT_WINDOW_MS;
  return { docs, pending: missing.filter(fresh), overdue: missing.filter((d) => !fresh(d)) };
}

/**
 * Gate for catalog/quote paths (INT-06/07). Throws 410 for deactivated/suspended merchants,
 * 428 for pending ones or when a document is un-accepted past the 30-day window. Within the
 * window it returns `terms_update_pending` for the caller to add to its response.
 */
export async function assertTermsAccepted(
  db: ShopTx,
  merchant: GuardMerchant,
  now: number = Date.now(),
): Promise<{ terms_update_pending?: { docs: Array<ReturnType<typeof docView>> } }> {
  if (
    merchant.status === 'deactivated' ||
    merchant.status === 'suspended' ||
    reasonBlocks(merchant.status_reason)
  ) {
    throw merchantUnavailable();
  }
  const st = await termsStatus(db, merchant.merchant_id, now);
  if (merchant.status === 'pending') throw termsNotAccepted(st.docs);
  if (st.overdue.length > 0) throw termsNotAccepted(st.docs);
  return st.pending.length > 0 ? { terms_update_pending: { docs: st.pending.map(docView) } } : {};
}
