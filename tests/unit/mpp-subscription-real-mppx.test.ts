/**
 * T-0431 MS-real: the subscription challenge of a quote pay URL, issued by the REAL mppx/server
 * factory through the runtime the middleware builds (createMppSubscriptionRuntime). mppx is
 * ESM-only, so the scenario runs in a tsx child (like shop-stream-merchant-real-mppx.test.ts).
 * No database, no network: the store is in memory.
 */
import { execFileSync } from 'child_process';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const QUOTE = '3f0c1d2e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const MERCHANT = '0x00000000000000000000000000000000000c0c0c';
const PATH_USD = '0x20c0000000000000000000000000000000000000';

describe('MS-real: the subscription challenge through the real mppx factory (T-0431)', () => {
  let r: any;
  beforeAll(() => {
    const stdout = execFileSync(
      path.join(root, 'node_modules/.bin/tsx'),
      [path.join(__dirname, 'helpers/mpp-subscription-real-mppx.child.ts')],
      { cwd: root, encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    r = JSON.parse(stdout.split('RESULT')[1]);
  }, 100000);

  it('the scenario ran', () => expect(r.crashed).toBeUndefined());
  it('a day plan gets ONE 402 challenge of method tempo, intent subscription', () => {
    expect(r.dayStatus).toBe(402);
    expect(r.headerCount).toBe(1);
    expect(r.challenge).toMatchObject({
      method: 'tempo',
      intent: 'subscription',
      realm: 'apibase.pro',
    });
  });
  it('the request carries the period, the price in base units and the merchant recipient', () => {
    expect(r.challenge.request).toMatchObject({
      amount: '5000000',
      periodUnit: 'day',
      periodCount: '1',
      recipient: MERCHANT,
      externalId: QUOTE,
    });
  });
  it('exactly one currency, on the configured chain', () => {
    expect(r.challenge.request.currency).toBe(PATH_USD);
    expect(r.challenge.request.methodDetails.chainId).toBe(42431);
  });
  it('the key to authorize is an access key address (never a payer key)', () => {
    const k = r.challenge.request.methodDetails.accessKey;
    expect(k.accessKeyAddress).toMatch(/^0x[0-9a-f]{40}$/);
    expect(k.keyType).toBe('secp256k1');
  });
  it('a week plan carries its count and unit', () => {
    expect(r.weekRequest).toMatchObject({ periodUnit: 'week', periodCount: '2' });
  });
  it('a month plan is refused by mppx itself (the spec allows day and week only)', () => {
    expect(r.monthStatus).toBeUndefined();
    expect(String(r.monthError)).toContain('periodUnit');
  });
});
