/**
 * T-0903: merchants_count (connected: active, not ours) and shops_listed_count (the /shops rule).
 * An active merchant on an internal wallet and the Demo Shop are not in merchants_count; an
 * unverified external one is; shops_listed_count equals listShops().total.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { countMerchants } from '../../src/shop/integrator/merchant-counts';
import { listShops } from '../../src/shop/storefront/storefront.service';
import { DEMO_SLUG } from '../../scripts/shop/seed-demo-merchant';
import { client, dbDescribe, migrate } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

dbDescribe('merchant counters (T-0903)', () => {
  const prisma = client();
  const tag = Date.now().toString(36);
  const internal = (
    JSON.parse(
      readFileSync(resolve(__dirname, '../../config/autopilot/internal-wallets.json'), 'utf8'),
    ) as Array<{ address: string }>
  )[0].address;

  const mk = async (slug: string, wallet: string, status: string, verified: boolean) => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_merchants (slug, name, category, country, wallet_address, payout_wallet_base,
          payout_wallet_tempo, contact_email, site_url, status, domain_verified, policy)
       VALUES ($1, $2, 'sporting-goods', 'US', $3, '0xb', '0xt', 'x@private.example',
               'https://shop.example', $4, $5, '{}'::jsonb)`,
      slug,
      `Shop ${slug}`,
      wallet,
      status,
      verified,
    );
  };

  beforeAll(async () => {
    migrate();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('CM1 internal wallet and the Demo Shop are not connected merchants; listed equals /shops', async () => {
    const before = await countMerchants(prisma as never, DEMO_SLUG);
    await mk(`cm-ours-${tag}`, internal.toUpperCase().replace('0X', '0x'), 'active', false);
    await mk(DEMO_SLUG, `0xdemo${tag}`, 'active', true);
    await mk(`cm-ext-${tag}`, `0xext${tag}`, 'active', false);
    await mk(`cm-off-${tag}`, `0xoff${tag}`, 'deactivated', false);
    const after = await countMerchants(prisma as never, DEMO_SLUG);
    expect(after.merchants - before.merchants).toBe(1);
    expect(after.listed - before.listed).toBe(1);
    expect(after.listed).toBe((await listShops(prisma as never, 1)).total);
  });
});
