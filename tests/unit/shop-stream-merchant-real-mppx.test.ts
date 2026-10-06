/**
 * T-INT-46 attempt 2, MS1-real: `close` of a merchant-settled channel through the REAL `mppx/server`
 * factory (no `jest.mock('mppx/server')`). mppx's `Mppx.ts` swallows the deferred signer's
 * SettlementDeferredError into a 402; the route must still answer 202 `close_pending`.
 * mppx is ESM-only, so the scenario runs in a tsx child (like mppx-redis-store.test.ts). Real
 * Postgres (TEST_DATABASE_URL, DISPOSABLE); the chain RPC is a local fake.
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { dbDescribe, migrate } from './helpers/shop-db';

const root = path.resolve(__dirname, '../..');

dbDescribe('MS1-real: merchant close through the real mppx/server factory (INT-46)', () => {
  let r: any;
  beforeAll(() => {
    migrate();
    const stdout = execFileSync(
      path.join(root, 'node_modules/.bin/tsx'),
      [path.join(__dirname, 'helpers/shop-stream-merchant-real-mppx.child.ts')],
      { cwd: root, encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    r = JSON.parse(stdout.split('RESULT')[1]);
  }, 100000);

  it('the scenario ran', () => expect(r.crashed).toBeUndefined());
  it('the real factory issued a challenge', () => expect(r.challengeStatus).toBe(402));
  it('close -> 202 close_pending, not the 402 mppx would answer', () => {
    expect(r.closeStatus).toBe(202);
    expect(r.closeBody).toMatchObject({ status: 'close_pending', channel_id: r.channelId });
  });
  it('the real handleClose read the chain and no transaction was sent', () => {
    expect(r.rpcMethods).toContain('eth_call');
    expect(r.rpcMethods).not.toContain('eth_sendRawTransaction');
    expect(r.rpcMethods).not.toContain('eth_sendRawTransactionSync');
  });
  it('the session is close_pending and the close voucher is kept', () => {
    expect(r.session.status).toBe('close_pending');
    expect(r.session.highest_voucher).toMatchObject({
      cumulativeAmount: r.cumulative,
      signature: r.signature,
    });
  });
});
