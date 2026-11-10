/**
 * A-GD-02: browser glue of apibase.pro/dispute/. The preview text is rendered by the server from the
 * receipt / by-tx JSON; this script only reads GenLayer (the same raw gen_call helper as /attest/) and
 * signs dispute_receipt / dispute_payment with the visitor's own wallet. Every value shown is set with
 * textContent, never as markup.
 */
import {
  estimateErrorText,
  explorerTxUrl,
  feeQuoteText,
  readableError,
  summariseTx,
  trackStep,
  type Observed,
} from '../attest/attest-view';
import {
  connectWallet,
  hasWallet,
  quoteFn,
  readTransaction,
  readViewAt,
  sendFn,
} from '../attest/chain';

const POLL_MS = 4000;
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

function el(tag: string, text?: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function link(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function setNote(id: string, text: string, tone: 'info' | 'warn' = 'info'): void {
  const n = $(id);
  n.textContent = text;
  n.className = `note ${tone}`;
  n.hidden = text === '';
}

/** `list_by_subject` returns a JSON array of dispute ids in a string; anything else is a failed read. */
export function parseDisputeIds(raw: unknown): string[] | null {
  if (typeof raw !== 'string') return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
  } catch {
    return null;
  }
}

function disputeCard(id: string, raw: unknown): HTMLElement {
  const wrap = el('article', undefined, 'card');
  let d: Record<string, unknown> | null = null;
  try {
    const v: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) d = v as Record<string, unknown>;
  } catch {
    d = null;
  }
  const verdict =
    d && typeof d.verdict === 'string' && d.verdict !== '' ? d.verdict : 'not returned';
  wrap.append(el('h3', verdict, 'badge'));
  const dl = el('dl', undefined, 'kv');
  const rows: Array<[string, string]> = [
    ['dispute_id', id],
    ['claim', String(d?.claim ?? 'not returned')],
    ['verdict', verdict],
    ['payer', String(d?.payer ?? 'not returned')],
    ['amount_atomic', String(d?.amount_atomic ?? 'not returned')],
  ];
  for (const [k, v] of rows) {
    dl.append(el('dt', k), el('dd', v));
  }
  wrap.append(dl);
  return wrap;
}

async function loadDisputes(contract: string, subject: string): Promise<string[]> {
  const box = $('disputes');
  let ids: string[] | null;
  try {
    ids = parseDisputeIds(await readViewAt(contract, 'list_by_subject', [subject]));
  } catch (e) {
    box.replaceChildren(el('p', `The list could not be read: ${readableError(e)}`, 'note warn'));
    return [];
  }
  if (ids === null) {
    box.replaceChildren(el('p', 'The list could not be read: unexpected answer.', 'note warn'));
    return [];
  }
  if (ids.length === 0) {
    box.replaceChildren(el('p', 'No dispute exists for this subject yet.', 'note info'));
    return [];
  }
  const nodes: HTMLElement[] = [];
  for (const id of ids) {
    try {
      nodes.push(disputeCard(id, await readViewAt(contract, 'get_dispute', [id])));
    } catch (e) {
      nodes.push(el('p', `Dispute ${id} could not be read: ${readableError(e)}`, 'note warn'));
    }
  }
  box.replaceChildren(...nodes);
  return ids;
}

function track(hash: string, contract: string, subject: string): void {
  const box = $('tracker');
  const startedAt = Date.now();
  let lifecycle: Observed[] = [];
  const tick = async (): Promise<void> => {
    let read;
    try {
      read = summariseTx(await readTransaction(hash), contract);
    } catch (e) {
      read = { ok: false as const, why: readableError(e) };
    }
    const step = trackStep({ startedAt, lifecycle }, read, Date.now());
    lifecycle = step.lifecycle;
    const status = step.tx?.status ?? null;
    let line = status ? `Status: ${status}` : 'Waiting for the first status...';
    let tone: 'info' | 'warn' = 'info';
    if (step.error) {
      line = `Could not read the transaction (retrying): ${step.error}`;
      tone = 'warn';
    } else if (step.notFound === 'absent') {
      line = 'Bradbury does not know this transaction hash.';
      tone = 'warn';
    }
    if (step.done === 'limit') {
      line = 'Stopped watching after 15 minutes without a final status.';
      tone = 'warn';
    }
    const ol = el('ol', undefined, 'lifecycle');
    for (const o of lifecycle) ol.append(el('li', `${o.status} (first seen ${o.at})`));
    const head = el('p', undefined, 'note info');
    head.append(el('span', 'Transaction '), link(explorerTxUrl(hash), hash));
    box.replaceChildren(head, el('p', line, `note ${tone}`), ol);
    if (step.done) {
      if (step.tx && step.tx.status === 'FINALIZED') await loadDisputes(contract, subject);
      return;
    }
    setTimeout(tick, POLL_MS);
  };
  void tick();
}

async function main(): Promise<void> {
  const root = document.getElementById('dispute-root');
  const btn = document.getElementById('dispute-btn') as HTMLButtonElement | null;
  if (!root || !btn) return;
  const claim = root.dataset.claim;
  const subject = root.dataset.subject ?? '';
  const contract = root.dataset.contract ?? '';
  const fn = claim === 'receipt' ? 'dispute_receipt' : 'dispute_payment';
  const args = claim === 'receipt' ? [subject] : ['8453', subject];
  const wallet = hasWallet();
  btn.disabled = !wallet;
  setNote(
    'dispute-reason',
    wallet
      ? ''
      : 'No browser wallet found. Install an EVM wallet (for example MetaMask) to dispute on GenLayer.',
    wallet ? 'info' : 'warn',
  );
  void loadDisputes(contract, subject);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      setNote('dispute-reason', 'Connect the wallet and confirm the transaction there...', 'info');
      const account = await connectWallet();
      let q;
      try {
        q = await quoteFn(account, contract, fn, args);
      } catch (e) {
        setNote('dispute-reason', estimateErrorText(e), 'warn');
        btn.disabled = false;
        return;
      }
      setNote('dispute-reason', `${feeQuoteText(q.feeValue)} Confirm in your wallet...`, 'info');
      const hash = await sendFn(account, contract, fn, args, q);
      setNote('dispute-reason', 'Transaction sent. Validators are now judging the claim.', 'info');
      track(hash, contract, subject);
    } catch (e) {
      setNote('dispute-reason', `Not sent: ${readableError(e)}`, 'warn');
      btn.disabled = false;
    }
  });
}

void main();
