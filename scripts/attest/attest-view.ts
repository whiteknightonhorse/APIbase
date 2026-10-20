/**
 * A-GA-02: pure helpers of the /attest/ page (no DOM, no network, no genlayer-js).
 *
 * The lifecycle tracker is a port of Provek's witnessView.js (whiteknightonhorse/provek,
 * web/src/witnessView.js): the 60-second UNINITIALIZED grace, the terminal status list and the
 * position-keyed lifecycle are kept as they are. Nothing here invents a value: each function returns
 * what an RPC response carried or an explicit refusal.
 */

export const CONTRACT_ADDRESS = '0x7572cAB5B7Ba1547cDF259988582E3BBd8E2eaf8';
export const CHAIN_ID = 4221;
export const RPC_URL = 'https://rpc-bradbury.genlayer.com';
export const EXPLORER_BASE = 'https://explorer-bradbury.genlayer.com';
export const FAUCET_URL = 'https://testnet-faucet.genlayer.foundation/';
export const RECEIPT_BASE_URL = 'https://apibase.pro/r/';

export const TERMINAL_STATUSES = [
  'FINALIZED',
  'UNDETERMINED',
  'CANCELED',
  'VALIDATORS_TIMEOUT',
  'LEADER_TIMEOUT',
];

export const UNDETERMINED_EXPLANATION =
  'Validators could not agree, typically because the receipt or the Base RPC was unavailable to them; no attestation was written.';

/** Receipt ids are 32 lowercase hex characters (the contract accepts 32-64). */
const RECEIPT_ID = /^[0-9a-f]{32}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export function parseReceiptId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  return RECEIPT_ID.test(s) ? s : null;
}

/** The `r` value of a query string (`location.search`), or null when absent. */
export function receiptFromQuery(search: unknown): string | null {
  if (typeof search !== 'string') return null;
  return new URLSearchParams(search).get('r');
}

export function parseTxHash(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  return TX_HASH.test(s) ? s : null;
}

export const explorerTxUrl = (hash: string): string => `${EXPLORER_BASE}/tx/${hash}`;
export const explorerAddressUrl = (address: string): string =>
  `${EXPLORER_BASE}/address/${address}`;
export const receiptJsonUrl = (id: string): string => `${RECEIPT_BASE_URL}${id}.json`;

export type IdList = { ok: true; ids: string[] } | { ok: false; why: string };

/** `list_by_receipt` returns a JSON array IN A STRING. Anything else is a failed read, not "[]". */
export function parseIdList(raw: unknown): IdList {
  if (typeof raw !== 'string') return { ok: false, why: 'list_by_receipt did not return a string' };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ok: false, why: 'list_by_receipt returned text that is not JSON' };
  }
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    return { ok: false, why: 'list_by_receipt did not return an array of strings' };
  }
  return { ok: true, ids: v as string[] };
}

const ATTESTATION_FIELDS = [
  'receipt_id',
  'receipt_sha256',
  'rail',
  'chain_id',
  'payment_tx',
  'payer',
  'payee',
  'amount_atomic',
  'tool',
  'response_sha256',
  'result',
  'observation',
  'checked_at',
  'requester',
] as const;

export interface AttestationCard {
  ok: true;
  attestId: string;
  recognised: boolean;
  upstream_status: string | null;
  billed: string | null;
  [field: string]: string | boolean | null;
}
export type AttestationResult = AttestationCard | { ok: false; why: string };

function scalar(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v);
  return null;
}

/**
 * `get_attestation` response -> the card the page renders. `result` is PASS, FAIL or NOT_FOUND;
 * anything else is carried through with `recognised: false`. A missing field is `null`
 * (rendered as "not returned"), never an empty string standing in.
 */
export function attestationCard(attestId: string, raw: unknown): AttestationResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, why: 'get_attestation did not return an object' };
  }
  const o = (raw instanceof Map ? Object.fromEntries(raw) : raw) as Record<string, unknown>;
  const card: AttestationCard = {
    ok: true,
    attestId,
    recognised: false,
    upstream_status: scalar(o.upstream_status),
    billed: scalar(o.billed),
  };
  for (const k of ATTESTATION_FIELDS) card[k] = typeof o[k] === 'string' ? (o[k] as string) : null;
  card.recognised = card.result === 'PASS' || card.result === 'FAIL' || card.result === 'NOT_FOUND';
  return card;
}

/** Only http(s) links are made from a received value; `javascript:` must not become a link. */
export function safeHref(url: unknown): string | null {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

/** USDC amount: atomic (6 decimals) string -> decimal string, or null. */
export function usdcFromAtomic(atomic: unknown): string | null {
  if (typeof atomic !== 'string' || !/^[0-9]{1,30}$/.test(atomic)) return null;
  const padded = atomic.padStart(7, '0');
  const whole = padded.slice(0, -6).replace(/^0+(?=\d)/, '');
  return `${whole}.${padded.slice(-6)}`;
}

/** Fields of a fetched receipt JSON worth showing, or a refusal. Unknown keys are ignored. */
export function receiptView(
  raw: unknown,
): { ok: true; fields: [string, string][] } | { ok: false; why: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, why: 'the receipt is not a JSON object' };
  }
  const o = raw as Record<string, unknown>;
  if (o.schema !== 'apibase-receipt/1')
    return { ok: false, why: 'the receipt schema is not apibase-receipt/1' };
  const keys = [
    'receipt_id',
    'issued_at',
    'tool',
    'upstream_status',
    'rail',
    'chain_id',
    'asset',
    'amount_atomic',
    'payer',
    'payee',
    'payment_tx',
    'response_sha256',
  ];
  const fields: [string, string][] = [];
  for (const k of keys) {
    const v = scalar(o[k]);
    fields.push([k, v === null ? 'not returned' : v]);
  }
  return { ok: true, fields };
}

/**
 * RPC errors from `gen_call` / wallet rejections: show the first line of the library's own text,
 * truncated. The raw text is never replaced by a guess. Wallet rejection (code 4001) is named.
 */
export function readableError(err: unknown): string {
  const e = (err ?? {}) as {
    code?: unknown;
    shortMessage?: unknown;
    details?: unknown;
    message?: unknown;
  };
  if (e.code === 4001) return 'The request was rejected in the wallet.';
  const parts = [e.shortMessage, e.details, e.message].filter(
    (x): x is string => typeof x === 'string' && x !== '',
  );
  const whole = parts.length ? parts.join('\n') : String(err ?? 'unknown error');
  const m = /unknown attest_id '[^']*'/.exec(whole);
  if (m) return `The contract answered: ${m[0]}`;
  const first = (parts[0] ?? whole).split('\n')[0];
  return first.length > 300 ? `${first.slice(0, 300)}...` : first;
}

export interface Observed {
  status: string;
  at: string;
}

/** Append `statusName` to the observed lifecycle only when it differs from the last one seen. */
export function observe(lifecycle: Observed[], statusName: unknown, atMs: number): Observed[] {
  if (typeof statusName !== 'string' || statusName === '') return lifecycle;
  const last = lifecycle[lifecycle.length - 1];
  if (last && last.status === statusName) return lifecycle;
  return [...lifecycle, { status: statusName, at: new Date(atMs).toISOString() }];
}

export const isTerminal = (statusName: string): boolean => TERMINAL_STATUSES.includes(statusName);

/** A just-returned hash may not be indexed by Bradbury yet; for this long UNINITIALIZED means "not
 *  indexed yet" and the watch goes on. */
export const NOT_INDEXED_GRACE_MS = 60 * 1000;
/** The watch stops after this long even if no terminal status arrived. */
export const WATCH_LIMIT_MS = 15 * 60 * 1000;

export interface TxFound {
  ok: true;
  found: true;
  status: string | null;
  consensusResult: string | null;
  execution: string | null;
  sender: string | null;
  recipient: string | null;
  forThisContract: boolean;
  succeeded: boolean;
  settledButFailed: boolean;
}
export type TxSummary = { ok: true; found: false } | TxFound | { ok: false; why: string };

/**
 * One `getTransaction` response -> the facts the tracker shows. UNINITIALIZED with a zero recipient
 * is what Bradbury answers for a hash it has never seen: "not found", a fact about the chain.
 */
export function summariseTx(tx: unknown, contractAddress: string = CONTRACT_ADDRESS): TxSummary {
  if (tx === null || typeof tx !== 'object')
    return { ok: false, why: 'no transaction object returned' };
  const t = tx as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const status = str(t.statusName);
  const recipient = str(t.recipient);
  if (status === 'UNINITIALIZED' || /^0x0+$/.test(recipient ?? ''))
    return { ok: true, found: false };
  const exec = str(t.txExecutionResultName);
  const forThisContract =
    recipient !== null && recipient.toLowerCase() === contractAddress.toLowerCase();
  const settled = status === 'ACCEPTED' || status === 'FINALIZED';
  // ACCEPTED/FINALIZED is consensus, not execution: the execution result is a separate field.
  return {
    ok: true,
    found: true,
    status,
    consensusResult: str(t.resultName),
    execution: exec,
    sender: str(t.sender),
    recipient,
    forThisContract,
    succeeded: settled && exec === 'FINISHED_WITH_RETURN',
    settledButFailed: settled && exec !== 'FINISHED_WITH_RETURN',
  };
}

export type TrackDone = 'terminal' | 'limit' | null;
export interface TrackStep {
  lifecycle: Observed[];
  tx: TxFound | null;
  notFound: 'not_indexed_yet' | 'absent' | null;
  notIndexedSeconds: number | null;
  error: string | null;
  done: TrackDone;
}

/**
 * One poll of the tracker. `prev.startedAt` is the first poll. A failed read is shown and retried.
 * UNINITIALIZED inside the grace window is `not_indexed_yet` and does NOT end the watch; past it,
 * `absent` does.
 */
export function trackStep(
  prev: { startedAt: number; lifecycle: Observed[] },
  read: TxSummary,
  nowMs: number,
  limitMs: number = WATCH_LIMIT_MS,
): TrackStep {
  let lifecycle = prev.lifecycle;
  let tx: TxFound | null = null;
  let notFound: TrackStep['notFound'] = null;
  let error: string | null = null;
  const waitedMs = nowMs - prev.startedAt;
  if (!read.ok) error = read.why;
  else if (read.found) {
    tx = read;
    if (tx.status) lifecycle = observe(lifecycle, tx.status, nowMs);
  } else notFound = waitedMs < NOT_INDEXED_GRACE_MS ? 'not_indexed_yet' : 'absent';
  const terminal = !!(tx && tx.status && isTerminal(tx.status));
  const done: TrackDone = terminal
    ? 'terminal'
    : waitedMs > limitMs
      ? 'limit'
      : notFound === 'absent'
        ? 'terminal'
        : null;
  return {
    lifecycle,
    tx,
    notFound,
    notIndexedSeconds: notFound ? Math.floor(waitedMs / 1000) : null,
    error,
    done,
  };
}

/** Why the button is disabled, or null when the visitor can attest. */
export function attestBlockReason(hasWallet: boolean, receiptId: string | null): string | null {
  if (receiptId === null)
    return 'Open this page with a receipt id (?r=<32 hex characters>) to attest it.';
  if (!hasWallet)
    return 'No browser wallet found. Install an EVM wallet (for example MetaMask) to attest on GenLayer.';
  return null;
}
