import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../config/logger';
import { judgeReceipt, isTxHash, type RuleOutcome } from '../payments/dispute-rules';
import { receiptIndexForTx, type ReceiptIndex } from '../services/receipt-index.service';
import {
  pgReceiptStore,
  RECEIPT_ID_RE,
  type ReceiptStore,
} from '../services/public-receipt.service';
import { escAttr, metaTags, SITE_FOOTER, SITE_NAV, SITE_NAV_CSS } from '../shop/page-meta';

/**
 * A-GD-02 (GENLAYER-DISPUTE-1102 ruling-1 §1-2): the public pages of the dispute action.
 *
 *   GET /dispute/?r=<receipt_id> | ?tx=<payment_tx>   rule preview + wallet filing (browser script)
 *   GET /r/<receipt_id>                               the receipt as a page, with the Dispute link
 *   GET /r/                                           what a receipt is, "Paid but no receipt?"
 *
 * The HTML is built from the receipt store / the by-tx index only. No chain RPC is awaited here (the
 * browser script reads GenLayer and Base itself), and each store read has a 5 s hard timeout that
 * turns into the `not_measured` state instead of a hang or an invented answer.
 */

/** Published refund policy file (static/policy/refunds.json); a test pins both values to the file. */
export const POLICY_VERSION = '2026-11-09.1';
export const POLICY_SHA256 = '0bb0d0c9aef195a349a48c44dc497b9620b3e4fee07989cf41b6931aeef1e3fb';
export const RECEIPT_DISPUTE_CONTRACT = '0xe4e75ac47bf8350Ff705a552b7453Cf7726eF893';
export const PAYMENT_DISPUTE_CONTRACT = '0x34e8335b70546fb37c9f2c06d472208b13b8f168';
export const STORE_TIMEOUT_MS = 5000;
const SITE = 'https://apibase.pro';

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'rate limited',
});

export const esc = (s: unknown): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Reject after `ms`: a silent store is `not_measured`, never a hang. */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface Preview {
  verdict: 'REFUND' | 'RELEASE' | 'REVERT' | 'not_measured';
  sentence: string;
}

const usdc = (atomic: string): string => {
  const n = BigInt(atomic);
  const frac = (n % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${n / 1_000_000n}${frac ? `.${frac}` : ''}`;
};

/** The preview of the receipt claim: the same rule the contract and the refund worker run. */
export function previewReceipt(body: string): Preview {
  let doc: unknown;
  try {
    doc = JSON.parse(body);
  } catch {
    return { verdict: 'REVERT', sentence: 'The receipt is not JSON: the contract would REVERT.' };
  }
  const out: RuleOutcome = judgeReceipt(doc);
  const r = doc as Record<string, unknown>;
  if (out.verdict === 'REFUND') {
    return {
      verdict: 'REFUND',
      sentence: `upstream_status ${String(r.upstream_status)} and billed: validators would REFUND ${usdc(out.amount_atomic)} USDC to the payer.`,
    };
  }
  if (out.verdict === 'RELEASE') {
    return {
      verdict: 'RELEASE',
      sentence:
        out.reason === 'not_billed'
          ? 'This call was not billed: validators would RELEASE.'
          : `upstream_status ${String(r.upstream_status)} and billed: validators would RELEASE.`,
    };
  }
  return {
    verdict: 'REVERT',
    sentence: `The receipt cannot be judged (${out.reason}): the contract would REVERT and nothing is recorded.`,
  };
}

/** The preview of the payment claim from APIbase's by-tx index; the Base transfer is not read here. */
export function previewPayment(ix: ReceiptIndex): Preview {
  if (ix.refund_tx) {
    return {
      verdict: 'RELEASE',
      sentence: 'This payment was already refunded: validators would RELEASE.',
    };
  }
  if (ix.receipt_ids.length > 0) {
    return {
      verdict: 'RELEASE',
      sentence: `APIbase issued receipt ${ix.receipt_ids[0]} for this payment: validators would RELEASE.`,
    };
  }
  return {
    verdict: 'not_measured',
    sentence:
      'APIbase has no receipt and no refund for this payment. Validators next read the USDC transfer on Base: a successful transfer to the APIbase payee wallet would be a REFUND, anything else a RELEASE. That chain read is not made by this page (not_measured).',
  };
}

const PAGE_CSS = `*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg,#0e100f);color:var(--ink,#eef1ed);min-height:100vh}
.at{max-width:860px;margin:0 auto;padding:40px 20px 56px}
.at h1{font-size:clamp(26px,5vw,40px);line-height:1.1;letter-spacing:-.02em;margin-bottom:16px}
.at h2{font-size:20px;margin:32px 0 10px}
.at h3{font-size:16px;margin-bottom:8px}
.at p,.at li{color:var(--ink-2,#b7beb8);font-size:16px;line-height:1.55;margin-top:10px}
.at a{color:var(--accent,#4fd283)}
.at .kv{display:grid;grid-template-columns:11rem 1fr;gap:6px 14px;font-size:14px}
.at .kv dt{color:var(--ink-3,#9ca59e)}
.at .kv dd{word-break:break-all;font-family:monospace;font-size:13px}
.at .card{border:1px solid var(--line,#272c29);border-radius:10px;background:var(--surf,#151816);padding:14px;margin-top:12px}
.at .note{border-left:3px solid var(--accent,#4fd283);padding:6px 10px;margin-top:10px;font-size:14px}
.at .note.warn{border-left-color:#e0a030}
.at .badge{display:inline-block;border:1px solid var(--line,#272c29);border-radius:6px;padding:2px 8px;font-family:monospace;font-size:13px}
.at button,.at .btn{display:inline-flex;align-items:center;min-height:48px;margin-top:14px;padding:0 24px;border:0;border-radius:8px;background:var(--accent,#4fd283);color:var(--on-accent,#04170c);font-weight:700;font-size:16px;cursor:pointer;text-decoration:none}
.at .btn{color:var(--on-accent,#04170c)}
.at button:disabled{opacity:.45;cursor:not-allowed}
.at input[type=text]{width:100%;min-height:44px;margin-top:10px;padding:0 10px;border-radius:8px;border:1px solid var(--line,#272c29);background:var(--surf,#151816);color:inherit;font-family:monospace}
.at ol.lifecycle{margin:10px 0 0 22px;font-family:monospace;font-size:13px}`;

function page(o: {
  title: string;
  description: string;
  path: string;
  body: string;
  script?: boolean;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>${esc(o.title)}</title>
${metaTags({ title: o.title, description: o.description, path: o.path })}
<meta name="robots" content="noindex">
<style>
${PAGE_CSS}
${SITE_NAV_CSS}
</style>
</head>
<body>
${SITE_NAV}
<main class="at">
${o.body}
</main>
${o.script ? '<script type="module" src="/dispute/dispute.js"></script>' : ''}
${SITE_FOOTER}
</body>
</html>`;
}

const policyBlock = (): string =>
  `<p class="note info">Rule version <code>${esc(POLICY_VERSION)}</code>, sha256 <code>${esc(POLICY_SHA256)}</code> of <a href="/policy/refunds.json">/policy/refunds.json</a>. Validators decide; a REFUND verdict is executed by APIbase only after it recomputes the same rule.</p>`;

function previewBlock(p: Preview): string {
  const tone = p.verdict === 'REFUND' ? '' : ' warn';
  return `<h2>Preview of the rule</h2>
<div class="card" id="preview" data-verdict="${escAttr(p.verdict)}"><span class="badge">${esc(p.verdict)}</span>
<p id="preview-sentence" class="note${tone}">${esc(p.sentence)}</p></div>
${policyBlock()}`;
}

/** The wallet section: the visible text is server-rendered, dispute.js wires the button. */
function walletBlock(claim: 'receipt' | 'payment', subject: string): string {
  const fn =
    claim === 'receipt' ? 'dispute_receipt(receipt_id)' : 'dispute_payment("8453", payment_tx)';
  const contract = claim === 'receipt' ? RECEIPT_DISPUTE_CONTRACT : PAYMENT_DISPUTE_CONTRACT;
  return `<h2>Existing disputes</h2>
<div id="disputes"><p class="note info">Reading existing disputes from GenLayer...</p></div>
<h2>File this dispute</h2>
<p>Connect your wallet on Bradbury Phase 2 (chain 4221) and call <code>${esc(fn)}</code> on contract <a href="https://scan.bradbury.genlayer.com/address/${esc(contract)}">${esc(contract)}</a>. The page quotes the fee before you sign. Bradbury is a test network; the fee is test GEN, not money. Test GEN comes from the <a href="https://testnet-faucet.genlayer.foundation/">faucet</a>. Filing a dispute never moves USDC; a REFUND verdict is paid by APIbase under the published caps.</p>
<noscript><p class="note warn">This page needs JavaScript to read GenLayer and to sign with your wallet.</p></noscript>
<button id="dispute-btn" type="button" disabled>Dispute on GenLayer</button>
<p id="dispute-reason" class="note info">Loading...</p>
<div id="tracker" aria-live="polite"></div>
<div id="dispute-root" hidden data-claim="${escAttr(claim)}" data-subject="${escAttr(subject)}" data-contract="${escAttr(contract)}"></div>`;
}

function pairs(rows: Array<[string, string]>): string {
  return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

export function renderDisputeForm(): string {
  return page({
    title: 'Dispute an APIbase payment or receipt',
    description:
      'Ask GenLayer validators to judge an APIbase receipt or a payment that has no receipt, with a preview of the rule before you sign.',
    path: '/dispute/',
    body: `<h1>Dispute an APIbase payment or receipt</h1>
<p>Two closed claims exist: a billed call whose upstream answered 5xx, and a USDC payment to APIbase that has no receipt. Open <code>/dispute/?r=&lt;receipt id&gt;</code> or paste a Base payment transaction hash below.</p>
<form method="get" action="/dispute/"><label for="tx">Payment transaction (Base)</label>
<input id="tx" name="tx" type="text" pattern="0x[0-9a-fA-F]{64}" placeholder="0x..." required>
<button type="submit">Preview the rule</button></form>
${policyBlock()}`,
  });
}

export function renderDisputeReceipt(id: string, body: string | null, measured: boolean): string {
  if (body === null && measured) {
    return page({
      title: 'No such APIbase receipt',
      description: 'No receipt with this id exists at APIbase, so there is nothing to dispute.',
      path: '/dispute/',
      body: `<h1>No such receipt</h1><p class="note warn">No receipt with the id ${esc(id)} exists at APIbase. If you paid and got no receipt, <a href="/dispute/">dispute the payment transaction</a> instead.</p>`,
    });
  }
  const preview: Preview =
    body === null
      ? {
          verdict: 'not_measured',
          sentence:
            'The receipt store did not answer within 5 seconds, so the rule was not previewed (not_measured). The contract reads the receipt itself when you file.',
        }
      : previewReceipt(body);
  return page({
    title: `Dispute APIbase receipt ${id}`,
    description:
      'Preview what GenLayer validators would decide for this APIbase receipt, then file the dispute with your wallet.',
    path: `/dispute/?r=${id}`,
    script: true,
    body: `<h1>Dispute this receipt</h1>
<p>Receipt <a href="/r/${esc(id)}">${esc(id)}</a> (<a href="/r/${esc(id)}.json">JSON</a>). Claim: <code>upstream_failed_but_billed</code>.</p>
${previewBlock(preview)}
${walletBlock('receipt', id)}`,
  });
}

export function renderDisputeTx(tx: string, ix: ReceiptIndex | null): string {
  const preview: Preview = ix
    ? previewPayment(ix)
    : {
        verdict: 'not_measured',
        sentence:
          'The receipt index did not answer within 5 seconds, so the rule was not previewed (not_measured). The contract reads the index itself when you file.',
      };
  return page({
    title: `Dispute APIbase payment ${tx.slice(0, 10)}`,
    description:
      'Preview what GenLayer validators would decide for a USDC payment to APIbase that has no receipt, then file with your wallet.',
    path: `/dispute/?tx=${tx}`,
    script: true,
    body: `<h1>Paid but no receipt?</h1>
<p>Payment transaction <code>${esc(tx)}</code> on Base. Claim: <code>paid_without_receipt</code>.</p>
${previewBlock(preview)}
${walletBlock('payment', tx)}`,
  });
}

export function renderReceiptPage(id: string, body: string): string {
  let rows: Array<[string, string]> = [];
  try {
    const doc = JSON.parse(body) as Record<string, unknown>;
    rows = Object.keys(doc)
      .sort()
      .map((k) => [k, typeof doc[k] === 'string' ? (doc[k] as string) : JSON.stringify(doc[k])]);
  } catch {
    rows = [['receipt', 'not readable as JSON']];
  }
  return page({
    title: `APIbase receipt ${id}`,
    description:
      'A public, immutable APIbase call receipt with links to attest it or dispute it on GenLayer.',
    path: `/r/${id}`,
    body: `<h1>Receipt ${esc(id)}</h1>
${pairs(rows)}
<p><a href="/r/${esc(id)}.json">Receipt JSON</a> (immutable) · <a href="/r/${esc(id)}.refund.json">Refund state</a> · <a href="/attest/?r=${esc(id)}">Attest on GenLayer</a></p>
<p><a class="btn" href="/dispute/?r=${esc(id)}">Dispute this receipt</a></p>`,
  });
}

export function renderReceiptIndex(): string {
  return page({
    title: 'APIbase public receipts',
    description:
      'Every billed on-chain APIbase call has a public receipt at /r/<id>; find out what to do when a payment has none.',
    path: '/r/',
    body: `<h1>APIbase public receipts</h1>
<p>Each billed on-chain call gets an immutable receipt at <code>${SITE}/r/&lt;receipt id&gt;</code> (JSON at <code>.json</code>), returned with the call as <code>receipt_url</code>. Open one to attest it or dispute it.</p>
<p><a class="btn" href="/dispute/">Paid but no receipt?</a></p>`,
  });
}

export interface DisputePageDeps {
  store: ReceiptStore;
  indexForTx: (tx: string) => Promise<ReceiptIndex>;
  timeoutMs: number;
}

const qs = (v: unknown): string | null => (typeof v === 'string' ? v.trim() : null);

export function createDisputePageRouter(deps?: Partial<DisputePageDeps>): Router {
  const d: DisputePageDeps = {
    store: deps?.store ?? pgReceiptStore,
    indexForTx: deps?.indexForTx ?? ((tx) => receiptIndexForTx(tx)),
    timeoutMs: deps?.timeoutMs ?? STORE_TIMEOUT_MS,
  };
  const router = Router();

  const send = (res: Response, status: number, html: string): void => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).type('html').send(html);
  };

  router.get(['/dispute', '/dispute/'], limiter, async (req: Request, res: Response) => {
    const r = qs(req.query.r);
    const tx = qs(req.query.tx)?.toLowerCase() ?? null;
    if (r !== null) {
      if (!RECEIPT_ID_RE.test(r)) {
        send(res, 400, renderDisputeForm());
        return;
      }
      try {
        const body = await within(d.store.get(r), d.timeoutMs);
        send(res, body === null ? 404 : 200, renderDisputeReceipt(r, body, true));
      } catch (err) {
        logger.warn({ err: String(err) }, 'dispute page: receipt store not measured');
        send(res, 200, renderDisputeReceipt(r, null, false));
      }
      return;
    }
    if (tx !== null) {
      if (!isTxHash(tx)) {
        send(res, 400, renderDisputeForm());
        return;
      }
      let ix: ReceiptIndex | null = null;
      try {
        ix = await within(d.indexForTx(tx), d.timeoutMs);
      } catch (err) {
        logger.warn({ err: String(err) }, 'dispute page: receipt index not measured');
      }
      send(res, 200, renderDisputeTx(tx, ix));
      return;
    }
    send(res, 200, renderDisputeForm());
  });

  router.get('/r/', limiter, (_req: Request, res: Response) => {
    send(res, 200, renderReceiptIndex());
  });

  // A bare receipt id; `<id>.json`, `<id>.refund.json` and `by-tx/...` fall through to the receipt router.
  router.get('/r/:id', limiter, async (req: Request, res: Response, next: NextFunction) => {
    const id: unknown = req.params.id;
    if (typeof id !== 'string' || !RECEIPT_ID_RE.test(id)) {
      next();
      return;
    }
    try {
      const body = await within(d.store.get(id), d.timeoutMs);
      if (body === null) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(404).json({ error: 'no such receipt' });
        return;
      }
      send(res, 200, renderReceiptPage(id, body));
    } catch (err) {
      logger.error({ err: String(err) }, 'receipt page: lookup failed');
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({ error: 'receipt store unavailable' });
    }
  });

  return router;
}
