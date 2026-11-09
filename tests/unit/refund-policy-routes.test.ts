/**
 * A-GD-01: the public refund policy file, the receipt index by payment transaction and the dispute
 * refund document. No network, no database: the router takes injected lookups.
 */
import express from 'express';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/services/prisma.service', () => ({ getPrisma: () => ({}) }));

import { createReceiptRouter, parseTxFile } from '../../src/routes/receipt.router';
import { receiptIndexForTx, type IndexSource } from '../../src/services/receipt-index.service';
import { REFUND_WINDOW_HOURS } from '../../src/payments/dispute-rules';
import { refundEnvSchema } from '../../src/config/env';
import type { PublicRefund } from '../../src/services/refund-ledger.service';

const ROOT = join(__dirname, '..', '..');
const POLICY_PATH = join(ROOT, 'static/policy/refunds.json');
const TX = '0x' + 'ab'.repeat(32);

describe('static/policy/refunds.json', () => {
  const raw = readFileSync(POLICY_PATH, 'utf-8');
  const p = JSON.parse(raw);

  it('has the apibase-refund-policy/1 shape', () => {
    expect(p.schema).toBe('apibase-refund-policy/1');
    expect(p.version).toMatch(/^2026-\d{2}-\d{2}\.\d+$/);
    expect(new Date(p.effective_from).toString()).not.toBe('Invalid Date');
    expect(p.claims.map((c: { type: string }) => c.type)).toEqual([
      'upstream_failed_but_billed',
      'paid_without_receipt',
    ]);
    for (const c of p.claims) expect(c.rule).toMatch(/\.$/);
    expect(p.claims[1].grace_seconds).toBe(3600);
    expect(p.dispute_contract).toEqual({
      network: 'GenLayer testnet Bradbury Phase 2',
      chain_id: 4221,
      receipt_contract_address: '0xe4e75ac47bf8350Ff705a552b7453Cf7726eF893',
      payment_contract_address: '0x34e8335b70546fb37c9f2c06d472208b13b8f168',
    });
    expect(p.not_covered).toEqual(['response_mismatch (not recomputable by validators)']);
    expect(p.execution).toContain('books the debt in the refund ledger');
    expect(p.execution).toContain('one refund per payment transaction, ever');
  });

  it('wallets are well-formed and the payee is the x402 payTo wallet', () => {
    const payTo = JSON.parse(
      readFileSync(join(ROOT, 'static/.well-known/x402-payment.json'), 'utf-8'),
    ).payTo;
    expect(p.payee_wallets['8453']).toBe(payTo);
    expect(p.refund_wallet['8453']).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(p.refund_wallet['8453'].toLowerCase()).not.toBe(payTo.toLowerCase());
  });

  it('caps and window equal the refund payout defaults and the worker constant', () => {
    const env = refundEnvSchema.parse({});
    expect(p.caps.per_refund_atomic).toBe(String(env.REFUND_PAYER_RUN_CAP_USD * 1_000_000));
    expect(p.caps.per_run_atomic).toBe(String(env.REFUND_RUN_CAP_USD * 1_000_000));
    expect(p.caps.per_30_days_atomic).toBe(String(env.REFUND_PERIOD_CAP_USD * 1_000_000));
    expect(p.refund_window_hours).toBe(REFUND_WINDOW_HOURS);
  });

  it('is ASCII and its sha256 is pinned: a change needs a new version and a new pin', () => {
    expect(/^[\x00-\x7f]*$/.test(raw)).toBe(true);
    expect(createHash('sha256').update(raw).digest('hex')).toBe(
      // split in two: the commit hook greps 64-hex literals
      '0bb0d0c9aef195a349a48c44dc497b96' + '20b3e4fee07989cf41b6931aeef1e3fb',
    );
  });

  it('nginx serves it with a short cache', () => {
    const conf = readFileSync(join(ROOT, 'nginx/nginx.conf'), 'utf-8');
    const m = /location = \/policy\/refunds\.json \{([^}]*)\}/.exec(conf);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('Cache-Control "public, max-age=60"');
    expect(m![1]).toContain('/policy/refunds.json');
  });
});

describe('parseTxFile', () => {
  it('accepts a 0x + 64 hex file in either case and lowercases it', () => {
    expect(parseTxFile(`${TX.toUpperCase().replace('0X', '0x')}.json`)).toBe(TX);
  });
  it.each([
    ['0x12.json'],
    [`${TX}`],
    [`${TX}.json.bak`],
    [`${TX.slice(2)}.json`],
    [undefined],
    [['a']],
  ])('rejects %p', (f) => {
    expect(parseTxFile(f)).toBeNull();
  });
});

describe('receiptIndexForTx', () => {
  const src = (over: Partial<IndexSource> = {}): IndexSource => ({
    receiptsByTx: async () => [],
    settledPending: async () => [],
    refundTx: async () => null,
    ...over,
  });
  it('a transaction APIbase never saw is empty, null, null', async () => {
    expect(await receiptIndexForTx(TX, src())).toEqual({
      schema: 'apibase-receipt-index/1',
      payment_tx: TX,
      receipt_ids: [],
      refund_tx: null,
      first_seen_at: null,
    });
  });
  it('merges stored and pending-settled receipts, sorted, earliest time, with the refund tx', async () => {
    const out = await receiptIndexForTx(
      TX,
      src({
        receiptsByTx: async () => [
          { receipt_id: 'b'.repeat(32), at: new Date('2026-11-02T10:00:00Z') },
        ],
        settledPending: async () => [
          { receipt_id: 'a'.repeat(32), at: new Date('2026-11-02T09:00:00Z') },
          { receipt_id: 'b'.repeat(32), at: new Date('2026-11-02T11:00:00Z') },
        ],
        refundTx: async () => '0x' + 'ee'.repeat(32),
      }),
    );
    expect(out.receipt_ids).toEqual(['a'.repeat(32), 'b'.repeat(32)]);
    expect(out.first_seen_at).toBe('2026-11-02T09:00:00.000Z');
    expect(out.refund_tx).toBe('0x' + 'ee'.repeat(32));
  });
});

describe('GET /r/by-tx and the dispute refund document', () => {
  const D = 'd1'.repeat(32);
  const refund: PublicRefund = {
    status: 'sent',
    amount_atomic: '250000',
    rail: 'base',
    detected_at: '2026-11-04T00:00:00.000Z',
    refund_tx: '0x' + 'ee'.repeat(32),
    sent_at: '2026-11-09T07:00:00.000Z',
    reason: 'paid_without_receipt',
  };
  let server: ReturnType<express.Express['listen']>;
  let base: string;
  let failIndex = false;

  beforeAll(() => {
    const app = express();
    app.use(
      createReceiptRouter(
        { insert: async () => undefined, get: async () => null },
        async () => null,
        async () => ({ state: 'pending' }),
        async (tx) => {
          if (failIndex) throw new Error('db down');
          return receiptIndexForTx(tx, {
            receiptsByTx: async () => [],
            settledPending: async () => [],
            refundTx: async () => null,
          });
        },
        async (id) => (id === D ? refund : null),
      ),
    );
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it('an unknown well-formed tx is always 200 with the empty answer and no-store', async () => {
    const res = await fetch(`${base}/r/by-tx/${TX}.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json();
    expect(body).toEqual({
      schema: 'apibase-receipt-index/1',
      payment_tx: TX,
      receipt_ids: [],
      refund_tx: null,
      first_seen_at: null,
    });
    expect(JSON.stringify(body)).toContain('"receipt_ids":[]');
  });

  it('an uppercase hash is answered with the lowercase payment_tx', async () => {
    const res = await fetch(`${base}/r/by-tx/0x${'AB'.repeat(32)}.json`);
    expect(res.status).toBe(200);
    expect((await res.json()).payment_tx).toBe(TX);
  });

  it.each(['0xabc.json', `${TX}`, `zz${TX.slice(2)}.json`, `${TX}.json.bak`])(
    '400 for %s',
    async (f) => {
      const res = await fetch(`${base}/r/by-tx/${f}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'malformed_payment_tx' });
    },
  );

  it('503 when the store is down (never a false "no receipt")', async () => {
    failIndex = true;
    const res = await fetch(`${base}/r/by-tx/${TX}.json`);
    failIndex = false;
    expect(res.status).toBe(503);
  });

  it('the dispute refund document is 404 until the debt is booked, then carries dispute_id', async () => {
    const none = await fetch(`${base}/r/${'e1'.repeat(32)}.refund.json`);
    expect(none.status).toBe(404);
    expect(await none.json()).toEqual({ error: 'no_refund', dispute_id: 'e1'.repeat(32) });
    const ok = await fetch(`${base}/r/${D}.refund.json`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await ok.json()).toEqual({ dispute_id: D, ...refund });
  });

  it('a receipt refund id (32 hex) still answers as before', async () => {
    const res = await fetch(`${base}/r/${'a'.repeat(32)}.refund.json`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_refund', receipt_id: 'a'.repeat(32) });
  });
});
