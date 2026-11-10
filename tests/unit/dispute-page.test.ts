/** A-GD-02: /dispute/ and /r/<id> pages, the rule preview and the MCP dispute_url. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  PAYMENT_DISPUTE_CONTRACT,
  POLICY_SHA256,
  POLICY_VERSION,
  RECEIPT_DISPUTE_CONTRACT,
  createDisputePageRouter,
  previewPayment,
  previewReceipt,
} from '../../src/routes/dispute-page.router';
import { judgePayment } from '../../src/payments/dispute-rules';
import {
  MCP_DISPUTE_URL_META_KEY,
  disputeUrl,
  receiptUrl,
} from '../../src/services/public-receipt.service';
import type { ReceiptIndex } from '../../src/services/receipt-index.service';

const ROOT = join(__dirname, '..', '..');
const ID = '9dbc77f9fd66bcb8714cd064f5681005';
const TX = '0x' + 'ab'.repeat(32);
const PAYER = '0x' + '11'.repeat(20);

const receipt = (over: Record<string, unknown>): string =>
  JSON.stringify({
    schema: 'apibase-receipt/1',
    rail: 'x402-base',
    payer: PAYER,
    amount_atomic: '1000',
    billed: true,
    upstream_status: 200,
    ...over,
  });

const ix = (over: Partial<ReceiptIndex>): ReceiptIndex => ({
  schema: 'apibase-receipt-index/1',
  payment_tx: TX,
  receipt_ids: [],
  refund_tx: null,
  first_seen_at: null,
  ...over,
});

async function serve(deps: Parameters<typeof createDisputePageRouter>[0]) {
  const app = express();
  app.use(createDisputePageRouter(deps));
  app.use((_req, res) => res.status(418).send('fell through'));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

describe('preview outcomes', () => {
  it('REFUND for a billed 5xx receipt, with the amount', () => {
    const p = previewReceipt(receipt({ upstream_status: 503 }));
    expect(p.verdict).toBe('REFUND');
    expect(p.sentence).toContain(
      'upstream_status 503 and billed: validators would REFUND 0.001 USDC',
    );
  });
  it('RELEASE for billed 200 and for not billed', () => {
    expect(previewReceipt(receipt({})).sentence).toBe(
      'upstream_status 200 and billed: validators would RELEASE.',
    );
    expect(previewReceipt(receipt({ billed: false })).sentence).toContain('not billed');
  });
  it('REVERT for a malformed receipt or non-JSON', () => {
    expect(previewReceipt(receipt({ rail: 'other' })).verdict).toBe('REVERT');
    expect(previewReceipt('{nope').verdict).toBe('REVERT');
  });
  it('payment: RELEASE when a receipt or refund exists, not_measured for the chain part otherwise', () => {
    expect(previewPayment(ix({ receipt_ids: [ID] })).verdict).toBe('RELEASE');
    expect(previewPayment(ix({ refund_tx: TX })).verdict).toBe('RELEASE');
    expect(previewPayment(ix({})).verdict).toBe('not_measured');
  });
});

describe('policy constants match the published file', () => {
  const raw = readFileSync(join(ROOT, 'static/policy/refunds.json'));
  const p = JSON.parse(raw.toString('utf8'));
  it('version, sha256 and contract addresses', () => {
    expect(POLICY_VERSION).toBe(p.version);
    expect(POLICY_SHA256).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(RECEIPT_DISPUTE_CONTRACT).toBe(p.dispute_contract.receipt_contract_address);
    expect(PAYMENT_DISPUTE_CONTRACT).toBe(p.dispute_contract.payment_contract_address);
  });
});

describe('previewPayment parity with judgePayment', () => {
  const payee = '0x' + '22'.repeat(20);
  const cases: Array<[string, Partial<ReceiptIndex>]> = [
    ['refund_tx set', { refund_tx: '0x' + 'cd'.repeat(32) }],
    ['receipt_ids non-empty', { receipt_ids: [ID] }],
  ];
  it.each(cases)('%s: same verdict as the contract rule', (_n, over) => {
    const i = ix(over);
    const rule = judgePayment({ tx: TX, index: i, chain: null, payee });
    expect(rule.verdict).toBe('RELEASE');
    expect(previewPayment(i).verdict).toBe(rule.verdict);
  });
  it('neither: not_measured, sentence names REFUND and RELEASE', () => {
    const p = previewPayment(ix({}));
    expect(p.verdict).toBe('not_measured');
    expect(p.sentence).toContain('REFUND');
    expect(p.sentence).toContain('RELEASE');
  });
});

describe('HTTP handlers', () => {
  const store = (body: string | null) => ({
    insert: jest.fn(),
    get: jest.fn(async () => body),
  });

  it('answers < 1 s without any chain read', async () => {
    const s = await serve({ store: store(receipt({})), indexForTx: async () => ix({}) });
    const t0 = Date.now();
    const res = await fetch(`${s.base}/dispute/?r=${ID}`);
    const html = await res.text();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(res.status).toBe(200);
    expect(html).toContain('validators would RELEASE');
    expect(html).toContain(POLICY_VERSION);
    expect(html).toContain(POLICY_SHA256);
    expect(html).toContain('/policy/refunds.json');
    expect(html).toContain('Bradbury is a test network; the fee is test GEN, not money.');
    await s.close();
  });

  it('the page module imports no chain client', () => {
    const src = readFileSync(join(ROOT, 'src/routes/dispute-page.router.ts'), 'utf8');
    const imports = src
      .split('\n')
      .filter((l) => /^import /.test(l))
      .join('\n');
    expect(imports).not.toMatch(/genlayer|gen-call|viem|gen-client/);
  });

  it('a silent store gives the not_measured state after the hard timeout, not a hang', async () => {
    const hung = { insert: jest.fn(), get: () => new Promise<string | null>(() => undefined) };
    const s = await serve({ store: hung, timeoutMs: 50 });
    const t0 = Date.now();
    const res = await fetch(`${s.base}/dispute/?r=${ID}`);
    const html = await res.text();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(res.status).toBe(200);
    expect(html).toContain('not_measured');
    await s.close();
  });

  it('?tx= renders the payment claim; a bad id is 400; unknown receipt is 404', async () => {
    const s = await serve({
      store: store(null),
      indexForTx: async () => ix({ receipt_ids: [ID] }),
    });
    const ok = await fetch(`${s.base}/dispute/?tx=${TX}`);
    expect(await ok.text()).toContain('validators would RELEASE');
    expect((await fetch(`${s.base}/dispute/?tx=0x12`)).status).toBe(400);
    expect((await fetch(`${s.base}/dispute/?r=zz`)).status).toBe(400);
    expect((await fetch(`${s.base}/dispute/?r[]=a`)).status).toBe(200); // array value is ignored, form shown
    expect((await fetch(`${s.base}/dispute/?r=${ID}`)).status).toBe(404);
    await s.close();
  });

  it('/r/<id> carries "Dispute this receipt"; .json falls through; the index links ?tx= entry', async () => {
    const s = await serve({ store: store(receipt({})) });
    const page = await (await fetch(`${s.base}/r/${ID}`)).text();
    expect((page.match(/Dispute this receipt/g) ?? []).length).toBe(1);
    expect(page).not.toContain('/dispute/?tx=');
    expect(page).toContain(`/dispute/?r=${ID}`);
    expect((await fetch(`${s.base}/r/${ID}.json`)).status).toBe(418);
    expect(await (await fetch(`${s.base}/r/`)).text()).toContain('Paid but no receipt?');
    await s.close();
  });

  it('escapes receipt content and holds no secret', async () => {
    const s = await serve({ store: store(receipt({ note: '<script>alert(1)</script>' })) });
    const page = await (await fetch(`${s.base}/r/${ID}`)).text();
    expect(page).not.toContain('<script>alert(1)');
    const d = await (await fetch(`${s.base}/dispute/?r=${ID}`)).text();
    expect(d).not.toMatch(/GL_DISPUTE_KEY|PRIVATE KEY|api[_-]?key/i);
    await s.close();
  });
});

describe('MCP dispute_url', () => {
  it('is the dispute page of the same receipt id, next to receipt_url', () => {
    expect(MCP_DISPUTE_URL_META_KEY).toBe('apibase/dispute_url');
    expect(disputeUrl(ID)).toBe(`https://apibase.pro/dispute/?r=${ID}`);
    expect(receiptUrl(ID)).toBe(`https://apibase.pro/r/${ID}.json`);
  });
});
