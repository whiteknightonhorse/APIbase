/**
 * T-INT-25 FI1-FI6: monthly Base fee invoices, payment verification (chain mocked, read-only), the
 * 30/60-day restrictions and the FEE_INVOICE_OVERDUE signal. Real Postgres (TEST_DATABASE_URL,
 * disposable). No chain, no RPC: the receipt reader is injected.
 */
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import express from 'express';
import { runShopFeeInvoice } from '../../src/jobs/shop-fee-invoice.job';
import { runShopSlaSweeper } from '../../src/jobs/shop-sla-sweeper.job';
import { getX402Config } from '../../src/config/x402.config';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import { markFeeInvoicePaid, type FeeInvoiceDeps } from '../../src/shop/fee-invoice.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { loadOwnerView } from '../../src/shop/owner.service';
import { createQuote } from '../../src/shop/quote.service';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { getMerchantStats } from '../../src/shop/stats.service';
import type { RefundChain, RefundReceipt } from '../../src/shop/refund.service';
import { client, dbDescribe, migrate, mkMerchant, mkOrder, mkQuote } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: {
    ENCRYPTION_KEY: 'k'.repeat(40),
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
  },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
}));

type Row = Record<string, any>;
const E = process['env'];
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const OTHER_WALLET = '0x00000000000000000000000000000000000dead0';
const D = 86_400_000;
const NOW = Date.UTC(2026, 9, 1, 3, 10); // 1 October 2026: invoices September
const RUN = Date.now() * 1000; // the DB outlives a run: transaction hashes must not repeat
const hash = (n: number) => `0x${(RUN + n).toString(16).padStart(64, '0')}`;

dbDescribe('fee invoices (INT-25)', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: {
      incr: async () => 1,
      expire: async () => 1,
      get: async () => null,
      set: async () => 'OK',
    } as never,
  };
  let n = 0;
  let txn = 1;
  const tag = () => `${Date.now().toString(36)}i${n++}`;
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  let usdc = '';

  beforeAll(() => {
    migrate();
    usdc = getX402Config().usdcAddress;
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'true',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_FEE_WALLET: FEE_WALLET,
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
  });

  /** A merchant with accepted terms and one instant product, ready for createQuote. */
  async function merchant(): Promise<{ m: string; sku: string }> {
    const m = await mkMerchant(prisma, tag());
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await q(`SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`, doc_id);
      if (have.length === 0) {
        await x(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'int25', $2, $3, now() - interval '1 day', 'b')`,
          doc_id,
          doc_id.padEnd(64, '0'),
          `/legal/${doc_id}`,
        );
      }
    }
    await x(
      `INSERT INTO shop_acceptances (merchant_id, doc_id, version, sha256, method, signer, signature, message)
       SELECT DISTINCT ON (doc_id) $1::uuid, doc_id, version, sha256, 'wallet_signature', 's', 'sig', 'm'
         FROM shop_legal_docs WHERE doc_id IN ('merchant-agreement','aup','dpa','refund-framework')
        ORDER BY doc_id, effective_from DESC`,
      m,
    );
    await x(
      `UPDATE shop_merchants SET status = 'active', created_at = now() - interval '90 days' WHERE merchant_id = $1::uuid`,
      m,
    );
    const sku = `sku-${tag()}`;
    await x(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category, fulfillment_mode)
       VALUES ($1::uuid, $2, 'Thing', 89, NULL, false, 'books', 'instant')`,
      m,
      sku,
    );
    return { m, sku };
  }

  /** One ledger row on an order of `m`, created mid-September. */
  async function ledger(m: string, fee: number, mode: 'receivable' | 'in_tx', status = 'owed') {
    const o = await mkOrder(prisma, m, await mkQuote(prisma, m, { status: 'paid' }), 'PAID');
    await x(
      `INSERT INTO shop_fee_ledger (merchant_id, order_id, fee_usd, mode, status, created_at)
       VALUES ($1::uuid, $2::uuid, $3::numeric, $4, $5, '2026-09-15T12:00:00Z')`,
      m,
      o,
      fee,
      mode,
      status,
    );
  }

  const invoicesOf = (m: string) =>
    q(
      `SELECT invoice_id, period, amount_usd::text AS amount, status, paid_tx_hash
         FROM shop_fee_invoices WHERE merchant_id = $1::uuid`,
      m,
    );
  const outbox = (type: string, m: string) =>
    q(`SELECT payload FROM outbox WHERE event_type = $1 AND payload->>'merchant_id' = $2`, type, m);

  const chainOf = (r: RefundReceipt): RefundChain => ({ receipt: async () => r });
  const okReceipt = (to: string, micro: string, token = usdc): RefundReceipt => ({
    status: 'success',
    transfers: [{ token, to, valueMicro: micro }],
  });
  const withChain = (c: RefundChain): FeeInvoiceDeps => ({ ...deps, chain: c });

  async function invoiced(m: string, fees: number[]) {
    for (const f of fees) await ledger(m, f, 'receivable');
    await runShopFeeInvoice(deps, NOW);
    return (await invoicesOf(m))[0];
  }

  it('FI1 three Base orders of $89 (fee $1.34) -> one $4.02 invoice, ledger invoiced, mail queued', async () => {
    const { m } = await merchant();
    await ledger(m, 1.34, 'receivable');
    await ledger(m, 1.34, 'receivable');
    await ledger(m, 1.34, 'receivable');
    const r = await runShopFeeInvoice(deps, NOW);
    expect(r.invoices_issued).toBeGreaterThanOrEqual(1);
    const inv = await invoicesOf(m);
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ period: '2026-09', status: 'open' });
    expect(Number(inv[0].amount)).toBeCloseTo(4.02, 6);
    const due = await q(
      `SELECT due_at FROM shop_fee_invoices WHERE invoice_id = $1::uuid`,
      inv[0].invoice_id,
    );
    expect(new Date(due[0].due_at).getTime()).toBe(NOW + 30 * D);
    const led = await q(
      `SELECT status, invoice_id FROM shop_fee_ledger WHERE merchant_id = $1::uuid`,
      m,
    );
    expect(led.map((l) => l.status)).toEqual(['invoiced', 'invoiced', 'invoiced']);
    expect(new Set(led.map((l) => l.invoice_id))).toEqual(new Set([inv[0].invoice_id]));
    const mail = await q(
      `SELECT kind, template, status, direction, msg_id FROM email_events WHERE merchant_id = $1::uuid`,
      m,
    );
    expect(mail).toEqual([
      {
        kind: 'fee_invoice',
        template: 'fee_invoice',
        status: 'queued',
        direction: 'out',
        msg_id: `out:fee_invoice:${inv[0].invoice_id}`,
      },
    ]);
    expect(await outbox('shop.fee_invoice.issued', m)).toHaveLength(1);
    // the rerun (same month) finds nothing owed
    await runShopFeeInvoice(deps, NOW + 60_000);
    expect(await invoicesOf(m)).toHaveLength(1);
    expect(await q(`SELECT 1 FROM email_events WHERE merchant_id = $1::uuid`, m)).toHaveLength(1);
  });

  it('FI2 Tempo (in_tx, collected) rows are not invoiced; this month and paid rows neither', async () => {
    const { m } = await merchant();
    await ledger(m, 1.34, 'in_tx', 'collected');
    await ledger(m, 1.34, 'in_tx', 'owed');
    await ledger(m, 2, 'receivable', 'paid');
    await runShopFeeInvoice(deps, NOW);
    expect(await invoicesOf(m)).toEqual([]);
    const { m: m2 } = await merchant();
    const o = await mkOrder(prisma, m2, await mkQuote(prisma, m2, { status: 'paid' }), 'PAID');
    await x(
      `INSERT INTO shop_fee_ledger (merchant_id, order_id, fee_usd, mode, status, created_at)
       VALUES ($1::uuid, $2::uuid, 1.5, 'receivable', 'owed', '2026-10-01T00:00:01Z')`,
      m2,
      o,
    );
    await runShopFeeInvoice(deps, NOW);
    expect(await invoicesOf(m2)).toEqual([]);
  });

  it('FI3 fee = 0 (switch off): no invoice, nothing queued', async () => {
    E['INTEGRATOR_FEE_ENABLED'] = 'false';
    const { m } = await merchant();
    await ledger(m, 0, 'receivable');
    await runShopFeeInvoice(deps, NOW);
    expect(await invoicesOf(m)).toEqual([]);
    expect(await q(`SELECT 1 FROM email_events WHERE merchant_id = $1::uuid`, m)).toEqual([]);
    expect(await outbox('shop.fee_invoice.issued', m)).toEqual([]);
  });

  it('FI4 a transaction not paying our wallet is rejected; the right one marks invoice and ledger paid', async () => {
    const { m } = await merchant();
    const inv = await invoiced(m, [1.34, 1.34, 1.34]);
    const id = inv.invoice_id as string;
    const want = '4020000';
    const reject = async (receipt: RefundReceipt, reason: string) => {
      await expect(
        markFeeInvoicePaid(withChain(chainOf(receipt)), m, id, { tx_hash: hash(txn++) }),
      ).rejects.toMatchObject({ status: 422, message: expect.stringContaining(reason) });
      const r = await invoicesOf(m);
      expect(r[0]).toMatchObject({ status: 'open', paid_tx_hash: null });
      expect(
        (await q(`SELECT status FROM shop_fee_ledger WHERE invoice_id = $1`, id)).every(
          (l) => l.status === 'invoiced',
        ),
      ).toBe(true);
      return reason;
    };
    await reject(okReceipt(OTHER_WALLET, want), 'no_usdc_transfer_to_fee_wallet');
    await reject(okReceipt(FEE_WALLET, '4019999'), 'transfer_below_amount');
    await reject(
      okReceipt(FEE_WALLET, want, '0x00000000000000000000000000000000000bad01'),
      'no_usdc_transfer_to_fee_wallet',
    );
    await reject({ status: 'reverted', transfers: [] }, 'tx_reverted');
    await reject({ status: 'missing', transfers: [] }, 'tx_not_found_or_unconfirmed');
    // another merchant cannot settle this invoice
    const { m: other } = await merchant();
    await expect(
      markFeeInvoicePaid(withChain(chainOf(okReceipt(FEE_WALLET, want))), other, id, {
        tx_hash: hash(txn++),
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      markFeeInvoicePaid(withChain(chainOf(okReceipt(FEE_WALLET, want))), m, id, {
        tx_hash: 'nope',
      }),
    ).rejects.toMatchObject({ status: 400 });

    const good = hash(txn++);
    const paid = await markFeeInvoicePaid(
      withChain(chainOf(okReceipt(FEE_WALLET.toUpperCase().replace('0X', '0x'), '4020001'))),
      m,
      id,
      { tx_hash: good },
    );
    expect(paid).toMatchObject({ status: 'paid', paid_tx_hash: good });
    const after = await invoicesOf(m);
    expect(after[0]).toMatchObject({ status: 'paid', paid_tx_hash: good });
    const led = await q(
      `SELECT status, paid_tx_hash FROM shop_fee_ledger WHERE invoice_id = $1`,
      id,
    );
    expect(led.map((l) => l.status)).toEqual(['paid', 'paid', 'paid']);
    // the same call again is idempotent; the same tx cannot pay another invoice
    await expect(
      markFeeInvoicePaid(withChain(chainOf(okReceipt(FEE_WALLET, want))), m, id, { tx_hash: good }),
    ).resolves.toMatchObject({ status: 'paid' });
    const { m: m3 } = await merchant();
    const inv3 = await invoiced(m3, [1, 1, 1]);
    await expect(
      markFeeInvoicePaid(
        withChain(chainOf(okReceipt(FEE_WALLET, '9000000'))),
        m3,
        inv3.invoice_id,
        {
          tx_hash: good,
        },
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  const quoteFor = (m: string, sku: string) =>
    createQuote(deps, m, { identity: `agent:${tag()}` }, { items: [{ sku, qty: 1 }] });
  /** The rails stored on a fresh quote (what the buyer is offered). */
  const railsOf = async (m: string, sku: string) =>
    (
      await q(
        `SELECT rails_offered FROM shop_quotes WHERE quote_id = $1::uuid`,
        (await quoteFor(m, sku)).quote_id,
      )
    )[0].rails_offered as string[];
  const sweep = () => runShopSlaSweeper(deps, Date.now());

  it('FI5 30 days past due: Base off + one incident event; 60 days: suspended (410); payment lifts it', async () => {
    const { m, sku } = await merchant();
    const inv = await invoiced(m, [1.34, 1.34, 1.34]);
    const id = inv.invoice_id as string;
    expect(await railsOf(m, sku)).toEqual(['base', 'tempo']);

    await x(
      `UPDATE shop_fee_invoices SET due_at = now() - interval '29 days' WHERE invoice_id = $1::uuid`,
      id,
    );
    await sweep();
    expect(await railsOf(m, sku)).toEqual(['base', 'tempo']);
    expect(await outbox('shop.fee_invoice.overdue', m)).toHaveLength(0);

    await x(
      `UPDATE shop_fee_invoices SET due_at = now() - interval '31 days' WHERE invoice_id = $1::uuid`,
      id,
    );
    await sweep();
    await sweep();
    expect(await railsOf(m, sku)).toEqual(['tempo']);
    const ev = await outbox('shop.fee_invoice.overdue', m);
    expect(ev).toHaveLength(1);
    expect(ev[0].payload.invoice_id).toBe(id);
    expect((await invoicesOf(m))[0].status).toBe('overdue');
    const mm = await q(
      `SELECT status, status_reason FROM shop_merchants WHERE merchant_id = $1::uuid`,
      m,
    );
    expect(mm[0]).toEqual({ status: 'active', status_reason: 'fee_overdue_base_off' });

    await x(
      `UPDATE shop_fee_invoices SET due_at = now() - interval '61 days' WHERE invoice_id = $1::uuid`,
      id,
    );
    await sweep();
    await expect(quoteFor(m, sku)).rejects.toMatchObject({ status: 410 });
    const sus = await q(
      `SELECT status, status_reason FROM shop_merchants WHERE merchant_id = $1::uuid`,
      m,
    );
    expect(sus[0]).toEqual({ status: 'suspended', status_reason: 'fee_overdue_suspended' });
    expect(await outbox('shop.fee_invoice.overdue', m)).toHaveLength(1);

    await markFeeInvoicePaid(withChain(chainOf(okReceipt(FEE_WALLET, '4020000'))), m, id, {
      tx_hash: hash(txn++),
    });
    const back = await q(
      `SELECT status, status_reason FROM shop_merchants WHERE merchant_id = $1::uuid`,
      m,
    );
    expect(back[0]).toEqual({ status: 'active', status_reason: null });
    expect(await railsOf(m, sku)).toEqual(['base', 'tempo']);
  });

  it('FI5b paying one of two overdue invoices keeps the limit the other one calls for', async () => {
    const { m, sku } = await merchant();
    const a = await invoiced(m, [1, 1]);
    await x(
      `UPDATE shop_fee_invoices SET period = '2026-08' WHERE invoice_id = $1::uuid`,
      a.invoice_id,
    );
    await ledger(m, 3, 'receivable');
    await runShopFeeInvoice(deps, NOW);
    const all = await invoicesOf(m);
    expect(all).toHaveLength(2);
    const b = all.find((i) => i.invoice_id !== a.invoice_id) as Row;
    await x(
      `UPDATE shop_fee_invoices SET due_at = now() - interval '70 days' WHERE invoice_id = $1::uuid`,
      a.invoice_id,
    );
    await x(
      `UPDATE shop_fee_invoices SET due_at = now() - interval '35 days' WHERE invoice_id = $1::uuid`,
      b.invoice_id,
    );
    await sweep();
    await expect(quoteFor(m, sku)).rejects.toMatchObject({ status: 410 });
    await markFeeInvoicePaid(
      withChain(chainOf(okReceipt(FEE_WALLET, '2000000'))),
      m,
      a.invoice_id,
      {
        tx_hash: hash(txn++),
      },
    );
    expect(await railsOf(m, sku)).toEqual(['tempo']);
    expect(await outbox('shop.fee_invoice.overdue', m)).toHaveLength(2);
  });

  it('FI6 FEE_INVOICE_OVERDUE is HUMAN_ONLY: no fleet task, no model, no auto branch', () => {
    const routing = JSON.parse(
      readFileSync(join(__dirname, '../../config/autopilot/routing.json'), 'utf8'),
    );
    expect(routing.FEE_INVOICE_OVERDUE).toMatchObject({
      route_class: 'HUMAN_ONLY',
      fleet_task: false,
      model: null,
    });
    const engine = readFileSync(
      join(__dirname, '../../scripts/autopilot/incident-engine.py'),
      'utf8',
    );
    const src = engine.slice(
      engine.indexOf('def _src_fee_invoice_overdue'),
      engine.indexOf('def _src_moderation'),
    );
    expect(src).toContain("status = 'overdue'");
    expect(src).toContain('inv)'); // dedup by invoice id
  });

  it('owner page and shop.merchant.stats show the receivable and the open invoices; the route verifies', async () => {
    const { m } = await merchant();
    await ledger(m, 2.5, 'receivable'); // owed, not yet invoiced... (September -> invoiced below)
    const inv = await invoiced(m, [1.5]);
    await ledger(m, 0.75, 'receivable'); // owed again after the run
    await x(
      `UPDATE shop_fee_ledger SET created_at = now() WHERE status = 'owed' AND merchant_id = $1::uuid`,
      m,
    );
    const view = await loadOwnerView(deps, {
      merchant_id: m,
      slug: 's',
      name: 'n',
      status: 'active',
      status_reason: null,
      wallet_address: '0x',
    });
    expect(Number(view.fee.owed_usd)).toBeCloseTo(0.75, 6);
    expect(Number(view.fee.invoiced_usd)).toBeCloseTo(4, 6);
    expect(view.fee.open_invoices.map((i) => i.invoice_id)).toEqual([inv.invoice_id]);
    const stats = (await getMerchantStats(deps, m, {})) as Row;
    expect(stats.fee_receivable.open_invoices[0]).toMatchObject({
      invoice_id: inv.invoice_id,
      status: 'open',
    });
    expect(Number(stats.fee_receivable.owed_usd)).toBeCloseTo(0.75, 6);

    const key = await issueKey(prisma as never, m, ['stats:read', 'refunds:write']);
    const noScope = await issueKey(prisma as never, m, ['orders:read']);
    const app = express();
    app.use(express.json());
    app.use(createMerchantRouter(withChain(chainOf(okReceipt(FEE_WALLET, '4000000')))));
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const call = (method: string, path: string, k: string, body?: unknown) =>
      new Promise<{ status: number; json: Row }>((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            path,
            method,
            headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () =>
              resolve({
                status: res.statusCode ?? 0,
                json: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'),
              }),
            );
          },
        );
        req.on('error', reject);
        req.end(body ? JSON.stringify(body) : undefined);
      });
    try {
      const list = await call('GET', '/api/v1/shop/merchants/me/fee-invoices', key);
      expect(list.status).toBe(200);
      expect(list.json.invoices[0]).toMatchObject({
        invoice_id: inv.invoice_id,
        pay_to: FEE_WALLET,
        memo: inv.invoice_id,
      });
      const path = `/api/v1/shop/merchants/me/fee-invoices/${inv.invoice_id}/paid`;
      expect((await call('POST', path, noScope, { tx_hash: hash(txn++) })).status).toBe(403);
      const paid = await call('POST', path, key, { tx_hash: hash(txn++) });
      expect(paid.status).toBe(200);
      expect(paid.json.status).toBe('paid');
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
