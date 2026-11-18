import type { ShopTx } from '../db';
import { isInternalWallet } from '../../config/internal-wallets';
import { listedMerchantSql } from '../storefront/storefront.service';

export interface MerchantCounts {
  /** Active merchant accounts, listed or not, without the team's own wallets and the Demo Shop. */
  merchants: number;
  /** Active and domain-verified: the same set as /shops (listedMerchantSql), Demo Shop included. */
  listed: number;
}

/** T-0903: the two merchant numbers of mcp.json (merchants_count, shops_listed_count). */
export async function countMerchants(db: ShopTx, demoSlug: string): Promise<MerchantCounts> {
  const [active, listed] = await Promise.all([
    db.$queryRawUnsafe<Array<{ slug: string; wallet_address: string | null }>>(
      `SELECT slug, wallet_address FROM shop_merchants WHERE status = 'active'`,
    ),
    db.$queryRawUnsafe<Array<{ n: number | bigint }>>(
      `SELECT count(*)::int AS n FROM shop_merchants WHERE ${listedMerchantSql()}`,
    ),
  ]);
  return {
    merchants: active.filter((m) => m.slug !== demoSlug && !isInternalWallet(m.wallet_address))
      .length,
    listed: Number(listed[0]?.n ?? 0),
  };
}
