import type { ShopTx } from '../db';
import { ShopAuthError } from './errors';
import { issueKey, MERCHANT_SCOPES } from './merchant-key.service';
import { verifyWalletSignature, type NonceRedis, type SignPurpose } from './nonce.service';

export type Rail = 'base' | 'tempo';
export const PAYOUT_DELAY_MS = 24 * 3600 * 1000;

export interface Signed {
  message: string;
  signature: string;
}
interface MerchantRow {
  merchant_id: string;
  wallet_address: string;
  recovery_wallet: string | null;
  payout_wallet_base: string;
  payout_wallet_tempo: string;
  payout_pending: { wallet: string; rail: Rail; effective_at: string } | null;
  contact_email: string;
}
interface Deps {
  db: ShopTx;
  redis?: NonceRedis;
  now?: () => number;
}

async function loadMerchant(db: ShopTx, where: string, v: string): Promise<MerchantRow | null> {
  const rows = await db.$queryRawUnsafe<MerchantRow[]>(
    `SELECT merchant_id, wallet_address, recovery_wallet, payout_wallet_base, payout_wallet_tempo,
            payout_pending, contact_email FROM shop_merchants WHERE ${where}`,
    v,
  );
  return rows[0] ?? null;
}

const emit = (db: ShopTx, event_type: string, payload: unknown) =>
  db.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
    event_type,
    JSON.stringify(payload),
  );

async function revokeAll(db: ShopTx, merchant_id: string): Promise<void> {
  await db.$executeRawUnsafe(
    `UPDATE shop_merchant_keys SET revoked_at = now() WHERE merchant_id = $1::uuid AND revoked_at IS NULL`,
    merchant_id,
  );
}

async function verifyOwner(
  d: Deps,
  wallet: string,
  s: Signed,
  purpose: SignPurpose,
): Promise<void> {
  await verifyWalletSignature(
    { message: s.message, signature: s.signature, expectedAddress: wallet, purpose },
    { redis: d.redis, now: d.now },
  );
}

/** Rotate with a signature (purpose rotate_key) or with a still-valid key (`auth.key_hash`). */
export async function rotateKey(
  d: Deps,
  merchant_id: string,
  auth: { signature: Signed } | { key_hash: string },
): Promise<string> {
  const m = await loadMerchant(d.db, 'merchant_id = $1::uuid', merchant_id);
  if (!m) throw new ShopAuthError(401, 'unknown merchant');
  if ('signature' in auth) {
    await verifyOwner(d, m.wallet_address, auth.signature, 'rotate_key');
  }
  const key_hash = 'key_hash' in auth ? auth.key_hash : null;
  await d.db.$executeRawUnsafe(
    `UPDATE shop_merchant_keys SET revoked_at = now()
      WHERE merchant_id = $1::uuid AND revoked_at IS NULL AND ($2::text IS NULL OR key_hash = $2)`,
    merchant_id,
    key_hash,
  );
  const key = await issueKey(d.db, merchant_id, MERCHANT_SCOPES, 'rotated');
  await emit(d.db, 'shop.merchant.key_rotated', { merchant_id });
  return key;
}

/** Wallet signature (purpose reissue) revokes ALL keys and issues a fresh one. */
export async function reissueKeys(d: Deps, wallet: string, s: Signed): Promise<string> {
  const m = await loadMerchant(d.db, 'wallet_address = $1', wallet.toLowerCase());
  if (!m) throw new ShopAuthError(401, 'unknown merchant');
  await verifyOwner(d, m.wallet_address, s, 'reissue');
  await revokeAll(d.db, m.merchant_id);
  const key = await issueKey(d.db, m.merchant_id, MERCHANT_SCOPES, 'reissued');
  await emit(d.db, 'shop.merchant.keys_reissued', { merchant_id: m.merchant_id });
  return key;
}

/** Change the identity wallet. Needs recovery_wallet; both it and the new wallet must sign. */
export async function changeIdentity(
  d: Deps,
  merchant_id: string,
  a: { new_wallet: string; sig_by_recovery: Signed; sig_by_new: Signed },
): Promise<void> {
  const m = await loadMerchant(d.db, 'merchant_id = $1::uuid', merchant_id);
  if (!m) throw new ShopAuthError(401, 'unknown merchant');
  if (!m.recovery_wallet) {
    throw new ShopAuthError(409, 'no recovery_wallet set', 'set recovery_wallet first');
  }
  const next = a.new_wallet.toLowerCase();
  await verifyOwner(d, m.recovery_wallet, a.sig_by_recovery, 'owner');
  await verifyOwner(d, next, a.sig_by_new, 'owner');
  await d.db.$executeRawUnsafe(
    `UPDATE shop_merchants SET wallet_address = $2 WHERE merchant_id = $1::uuid`,
    merchant_id,
    next,
  );
  await revokeAll(d.db, merchant_id);
  await emit(d.db, 'shop.merchant.identity_changed', { merchant_id });
}

export async function isSanctioned(db: ShopTx, address: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM shop_sanctioned_addresses WHERE address = $1`,
    address.toLowerCase(),
  );
  return rows.length > 0;
}

/** Current wallet signs; OFAC check on the new one; takes effect after 24 h (sweeper: INT-12). */
export async function requestPayoutChange(
  d: Deps,
  merchant_id: string,
  a: { rail: Rail; new_wallet: string; signature: Signed },
): Promise<{ effective_at: string }> {
  const m = await loadMerchant(d.db, 'merchant_id = $1::uuid', merchant_id);
  if (!m) throw new ShopAuthError(401, 'unknown merchant');
  await verifyOwner(d, m.wallet_address, a.signature, 'payout_change');
  const wallet = a.new_wallet.toLowerCase();
  if (await isSanctioned(d.db, wallet)) {
    throw new ShopAuthError(403, 'payout wallet blocked by sanctions screening');
  }
  const effective_at = new Date((d.now ?? Date.now)() + PAYOUT_DELAY_MS).toISOString();
  await d.db.$executeRawUnsafe(
    `UPDATE shop_merchants SET payout_pending = $2::jsonb WHERE merchant_id = $1::uuid`,
    merchant_id,
    JSON.stringify({ wallet, rail: a.rail, effective_at }),
  );
  // email_events (0025 schema) is inbound-only; the outbound mail rides the outbox.
  await emit(d.db, 'shop.email.queued', {
    template: 'payout_change',
    direction: 'out',
    status: 'queued',
    to: m.contact_email,
    merchant_id,
    effective_at,
  });
  return { effective_at };
}

/** Quotes in the delay window keep paying the OLD wallet. */
export function currentPayout(
  m: Pick<MerchantRow, 'payout_wallet_base' | 'payout_wallet_tempo' | 'payout_pending'>,
  rail: Rail,
  now: number = Date.now(),
): string {
  const cur = rail === 'base' ? m.payout_wallet_base : m.payout_wallet_tempo;
  const p = m.payout_pending;
  return p && p.rail === rail && Date.parse(p.effective_at) <= now ? p.wallet : cur;
}
