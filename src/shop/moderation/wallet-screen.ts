import { createHash } from 'node:crypto';
import type { ShopTx } from '../db';
import { isPlatformWallet } from '../platform-wallets';
import { isSanctioned } from './sanctions';

export type WalletRole = 'identity' | 'payout' | 'recovery';
export type WalletVerdict = 'ok' | 'platform' | 'sanctioned';

/**
 * The one screen for every wallet APIbase stores for a merchant: OFAC SDN list plus the platform's own
 * wallets (identity and payout roles only; a recovery wallet never receives money). Call it from every
 * write path that stores a merchant wallet.
 */
export async function screenWallet(
  db: ShopTx,
  address: string,
  role: WalletRole,
): Promise<WalletVerdict> {
  if (role !== 'recovery' && isPlatformWallet(address)) return 'platform';
  return (await isSanctioned(db, address)) ? 'sanctioned' : 'ok';
}

/** Short stable fingerprint for events and review rows; the address itself is never written there. */
export const addressDigest = (address: string): string =>
  createHash('sha256').update(address.toLowerCase()).digest('hex').slice(0, 12);

/**
 * Suspend one merchant for a sanctions match. Money never moves automatically: the pending payout change
 * is dropped, the merchant is suspended with reason `sanctions_match`, and the incident engine opens
 * SANCTIONS_HIT (HUMAN route) from the moderation review row. Idempotent per merchant.
 */
export async function suspendForSanctions(
  db: ShopTx,
  merchantId: string,
  address: string,
): Promise<boolean> {
  const changed = await db.$executeRawUnsafe(
    `UPDATE shop_merchants SET status = 'suspended', status_reason = 'sanctions_match', payout_pending = NULL
      WHERE merchant_id = $1::uuid AND status <> 'deactivated'
        AND NOT (status = 'suspended' AND status_reason = 'sanctions_match')`,
    merchantId,
  );
  if (changed === 0) return false;
  const digest = addressDigest(address);
  await db.$executeRawUnsafe(
    `INSERT INTO shop_moderation_reviews (merchant_id, scope, layer, verdict, category, evidence_hash)
     VALUES ($1::uuid, 'merchant', 'rules', 'reject', 'sanctions_hit', $2)`,
    merchantId,
    `addr:${digest}`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload) VALUES ('shop.merchant.sanctions_hit', $1::jsonb)`,
    JSON.stringify({ merchant_id: merchantId, address_sha256: digest }),
  );
  return true;
}

interface WalletRow {
  merchant_id: string;
  wallet_address: string;
  recovery_wallet: string | null;
  payout_wallet_base: string | null;
  payout_wallet_tempo: string | null;
  pending_wallet: string | null;
}

/** After an OFAC list update: re-screen every wallet of every non-deactivated merchant. Returns suspended count. */
export async function rescreenMerchants(db: ShopTx): Promise<number> {
  const rows = await db.$queryRawUnsafe<WalletRow[]>(
    `SELECT merchant_id::text, wallet_address, recovery_wallet, payout_wallet_base, payout_wallet_tempo,
            payout_pending->>'wallet' AS pending_wallet
       FROM shop_merchants m
      WHERE status <> 'deactivated'
        AND EXISTS (SELECT 1 FROM shop_sanctioned_addresses s
                     WHERE s.address IN (lower(m.wallet_address), lower(m.recovery_wallet),
                                         lower(m.payout_wallet_base), lower(m.payout_wallet_tempo),
                                         lower(m.payout_pending->>'wallet')))`,
  );
  let suspended = 0;
  for (const r of rows) {
    const wallets = [
      r.wallet_address,
      r.recovery_wallet,
      r.payout_wallet_base,
      r.payout_wallet_tempo,
      r.pending_wallet,
    ].filter((a): a is string => typeof a === 'string' && a !== '');
    for (const a of wallets) {
      if (await isSanctioned(db, a)) {
        if (await suspendForSanctions(db, r.merchant_id, a)) suspended++;
        break;
      }
    }
  }
  return suspended;
}
