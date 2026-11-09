/** T-0724: the order view says who is looking (viewer payer|public) and hints at the credential. */
import { createHash } from 'node:crypto';
import { encryptSecret } from '../../src/services/secret-crypto.service';
import { getOrderView } from '../../src/shop/order-payment.service';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/index', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));

const OID = '11111111-1111-4111-8111-111111111111';
const WALLET = '0x00000000000000000000000000000000000a11ce';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function fakeDb(row: Record<string, unknown>) {
  let first = true;
  return {
    $queryRawUnsafe: async () => {
      if (first) {
        first = false;
        return [row];
      }
      return [];
    },
  } as never;
}
const base = () => ({
  order_id: OID,
  state: 'FULFILLED',
  tx_hash: '0xtx',
  fulfillment_payload_enc: encryptSecret('secret-content', 'k'.repeat(40)),
  merchant_id: '22222222-2222-4222-8222-222222222222',
  delivery_eta: null,
  buyer_identity: 'token:abc',
  payer_wallet: null,
});

describe('getOrderView viewer', () => {
  it('payer identity -> viewer payer, fulfillment present, no hint', async () => {
    const v = await getOrderView(fakeDb(base()), OID, 'token:abc');
    expect(v.viewer).toBe('payer');
    expect(v.fulfillment).toBe('secret-content');
    expect(v.hint).toBeUndefined();
  });

  it('ip: identity -> viewer public, hint present, no fulfillment, no wallet/hash in the JSON', async () => {
    const row = { ...base(), buyer_identity: 'ip:1.2.3.4', payer_wallet: WALLET };
    const v = await getOrderView(fakeDb(row), OID, 'ip:1.2.3.4');
    expect(v.viewer).toBe('public');
    expect(v.hint).toContain('Authorization: Bearer');
    expect(v.fulfillment).toBeUndefined();
    const json = JSON.stringify(v);
    expect(json).not.toContain(WALLET.slice(2));
    expect(json).not.toContain(sha(WALLET));
    expect(json).not.toContain('token:');
    expect(json).not.toContain('secret-content');
  });

  it('a stranger on a token order gets viewer public + hint', async () => {
    const v = await getOrderView(fakeDb(base()), OID, 'ip:9.9.9.9');
    expect(v.viewer).toBe('public');
    expect(v.hint).toBeDefined();
  });

  it('wallet-derived identity -> payer', async () => {
    const row = { ...base(), buyer_identity: null, payer_wallet: WALLET };
    const v = await getOrderView(fakeDb(row), OID, `wallet:${sha(WALLET.toLowerCase())}`);
    expect(v.viewer).toBe('payer');
    expect(v.fulfillment).toBe('secret-content');
  });
});
