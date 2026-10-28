/**
 * A-GA-02: DOM glue of apibase.pro/attest/. Every value shown comes from an RPC response or the
 * receipt JSON received in this session; all text is set with textContent, never as markup.
 */
import {
  attestBlockReason,
  attestationCard,
  explorerAddressUrl,
  estimateErrorText,
  explorerTxUrl,
  feeQuoteText,
  parseIdList,
  readableError,
  receiptFromQuery,
  receiptJsonUrl,
  receiptView,
  parseReceiptId,
  summariseTx,
  trackStep,
  usdcFromAtomic,
  CONTRACT_ADDRESS,
  UNDETERMINED_EXPLANATION,
  type AttestationCard,
  type Observed,
  type TxFound,
} from './attest-view';
import {
  connectWallet,
  hasWallet,
  quoteAttest,
  readTransaction,
  readView,
  sendAttest,
} from './chain';

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

function dl(rows: [string, string | HTMLElement][]): HTMLElement {
  const d = el('dl', undefined, 'kv');
  for (const [k, v] of rows) {
    d.append(el('dt', k));
    const dd = el('dd');
    if (typeof v === 'string') dd.textContent = v;
    else dd.append(v);
    d.append(dd);
  }
  return d;
}

function setNote(id: string, text: string, tone: 'info' | 'warn' = 'info'): void {
  const n = $(id);
  n.textContent = text;
  n.className = `note ${tone}`;
  n.hidden = text === '';
}

// ---- receipt ------------------------------------------------------------------------------

async function showReceipt(id: string): Promise<void> {
  const box = $('receipt');
  try {
    const res = await fetch(receiptJsonUrl(id), { headers: { accept: 'application/json' } });
    if (res.status === 404) {
      box.replaceChildren(el('p', 'No receipt with this id exists at APIbase.', 'note warn'));
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const view = receiptView(await res.json());
    if (!view.ok) {
      box.replaceChildren(el('p', `Receipt not shown: ${view.why}.`, 'note warn'));
      return;
    }
    const rows: [string, string | HTMLElement][] = view.fields.map(([k, v]) => {
      if (k === 'amount_atomic') {
        const usdc = usdcFromAtomic(v);
        return [k, usdc ? `${v} (${usdc} USDC)` : v];
      }
      if (k === 'receipt_id') return [k, link(receiptJsonUrl(id), v)];
      return [k, v];
    });
    box.replaceChildren(dl(rows));
  } catch (e) {
    box.replaceChildren(
      el('p', `The receipt could not be loaded: ${readableError(e)}`, 'note warn'),
    );
  }
}

// ---- attestations (read path, no wallet) -------------------------------------------------

function attestationNode(card: AttestationCard): HTMLElement {
  const wrap = el('article', undefined, 'card');
  const head = el('h3');
  head.append(
    el(
      'span',
      card.result === null ? 'not returned' : String(card.result),
      `badge ${String(card.result ?? 'none')}`,
    ),
  );
  if (!card.recognised) head.append(el('span', ' (not PASS, FAIL or NOT_FOUND)'));
  wrap.append(head);
  const nv = (v: string | boolean | null): string => (v === null ? 'not returned' : String(v));
  wrap.append(
    dl([
      ['attest_id', card.attestId],
      ['result', nv(card.result)],
      ['observation', nv(card.observation)],
      ['checked_at', nv(card.checked_at)],
      ['requester', nv(card.requester)],
      ['payment_tx (Base)', nv(card.payment_tx)],
      ['payer', nv(card.payer)],
      ['payee', nv(card.payee)],
      ['amount_atomic', nv(card.amount_atomic)],
      ['receipt_sha256', nv(card.receipt_sha256)],
    ]),
  );
  return wrap;
}

function retryButton(receiptId: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Retry';
  b.addEventListener('click', () => {
    b.disabled = true;
    void loadAttestations(receiptId);
  });
  return b;
}

async function loadAttestations(receiptId: string): Promise<AttestationCard[]> {
  const list = $('attestations');
  let idList;
  try {
    idList = parseIdList(await readView('list_by_receipt', [receiptId]));
  } catch (e) {
    list.replaceChildren(
      el('p', `The list could not be read: ${readableError(e)}`, 'note warn'),
      retryButton(receiptId),
    );
    return [];
  }
  if (!idList.ok) {
    list.replaceChildren(el('p', `The list could not be read: ${idList.why}.`, 'note warn'));
    return [];
  }
  if (idList.ids.length === 0) {
    list.replaceChildren(
      el('p', 'No GenLayer attestation exists for this receipt yet.', 'note info'),
    );
    return [];
  }
  const nodes: HTMLElement[] = [];
  const cards: AttestationCard[] = [];
  for (const attestId of idList.ids) {
    try {
      const card = attestationCard(attestId, await readView('get_attestation', [attestId]));
      if (card.ok) {
        cards.push(card);
        nodes.push(attestationNode(card));
      } else nodes.push(el('p', `Unreadable attestation ${attestId}: ${card.why}.`, 'note warn'));
    } catch (e) {
      nodes.push(
        el('p', `Attestation ${attestId} could not be read: ${readableError(e)}`, 'note warn'),
      );
    }
  }
  list.replaceChildren(...nodes);
  return cards;
}

// ---- lifecycle tracker -------------------------------------------------------------------

function track(hash: string, receiptId: string): void {
  const box = $('tracker');
  const startedAt = Date.now();
  let lifecycle: Observed[] = [];
  let finished = false;

  const render = (tx: TxFound | null, line: string, tone: 'info' | 'warn'): void => {
    const ol = el('ol', undefined, 'lifecycle');
    lifecycle.forEach((o, i) => {
      const li = el('li', `${o.status} (first seen ${o.at})`);
      li.dataset.key = `${i}-${o.status}`;
      ol.append(li);
    });
    const parts: HTMLElement[] = [
      el('p', undefined, 'note info'),
      el('p', line, `note ${tone}`),
      ol,
    ];
    parts[0].append(el('span', 'Transaction '), link(explorerTxUrl(hash), hash));
    if (tx && tx.settledButFailed) {
      parts.push(
        el(
          'p',
          `Consensus reached, but the contract call did not return (${tx.execution ?? 'no execution result'}).`,
          'note warn',
        ),
      );
    }
    box.replaceChildren(...parts);
  };

  const tick = async (): Promise<void> => {
    let read;
    try {
      read = summariseTx(await readTransaction(hash));
    } catch (e) {
      read = { ok: false as const, why: readableError(e) };
    }
    const step = trackStep({ startedAt, lifecycle }, read, Date.now());
    lifecycle = step.lifecycle;
    const status = step.tx?.status ?? null;
    let line = 'Waiting for the first status...';
    let tone: 'info' | 'warn' = 'info';
    if (step.error) {
      line = `Could not read the transaction (retrying): ${step.error}`;
      tone = 'warn';
    } else if (step.notFound === 'not_indexed_yet') {
      line = `Not indexed by Bradbury Phase 2 yet (${step.notIndexedSeconds} s); still watching.`;
    } else if (step.notFound === 'absent') {
      line = 'Bradbury does not know this transaction hash.';
      tone = 'warn';
    } else if (status) {
      line = `Status: ${status}`;
      if (status === 'UNDETERMINED') {
        line += `. ${UNDETERMINED_EXPLANATION}`;
        tone = 'warn';
      }
    }
    if (step.done === 'limit') {
      line = 'Stopped watching after 15 minutes without a final status.';
      tone = 'warn';
    }
    render(step.tx, line, tone);
    if (step.done) {
      if (!finished && step.tx && step.tx.status === 'FINALIZED') {
        finished = true;
        await loadAttestations(receiptId);
      }
      return;
    }
    setTimeout(tick, POLL_MS);
  };
  void tick();
}

// ---- boot --------------------------------------------------------------------------------

async function main(): Promise<void> {
  $('contract-link').replaceChildren(link(explorerAddressUrl(CONTRACT_ADDRESS), CONTRACT_ADDRESS));
  const raw = receiptFromQuery(window.location.search);
  const receiptId = parseReceiptId(raw);
  const btn = $('attest-btn') as HTMLButtonElement;
  const reason = attestBlockReason(hasWallet(), receiptId);
  btn.disabled = reason !== null;
  setNote('attest-reason', reason ?? '', 'info');

  if (receiptId === null) {
    if (raw !== null)
      setNote(
        'receipt-error',
        'The receipt id in the address is not 32 lowercase hex characters.',
        'warn',
      );
    return;
  }
  void showReceipt(receiptId);
  void loadAttestations(receiptId);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      setNote('attest-reason', 'Connect the wallet and confirm the transaction there...', 'info');
      const account = await connectWallet();
      let quote;
      try {
        quote = await quoteAttest(account, receiptId);
      } catch (e) {
        setNote('attest-reason', estimateErrorText(e), 'warn');
        btn.disabled = false;
        return;
      }
      setNote('attest-reason', `${feeQuoteText(quote.feeValue)} Confirm in your wallet...`, 'info');
      const hash = await sendAttest(account, receiptId, quote);
      setNote(
        'attest-reason',
        'Transaction sent. Validators are now checking the receipt.',
        'info',
      );
      track(hash, receiptId);
    } catch (e) {
      setNote('attest-reason', `Not sent: ${readableError(e)}`, 'warn');
      btn.disabled = false;
    }
  });
}

void main();
