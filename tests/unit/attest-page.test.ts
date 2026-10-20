/** A-GA-02: the /attest/ page -- lifecycle tracker, read-path rendering from a mocked RPC, wallet-less state, pins. No live network. */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CONTRACT_ADDRESS,
  NOT_INDEXED_GRACE_MS,
  attestBlockReason,
  attestationCard,
  parseIdList,
  parseReceiptId,
  readableError,
  receiptFromQuery,
  receiptView,
  summariseTx,
  trackStep,
  usdcFromAtomic,
  type Observed,
  type TxSummary,
} from '../../scripts/attest/attest-view';

const ROOT = resolve(__dirname, '../..');
const T0 = Date.parse('2026-10-20T07:00:00Z');
const ID = 'a'.repeat(32);

const UNKNOWN: TxSummary = { ok: true, found: false };
const tx = (statusName: string, extra: Record<string, unknown> = {}) =>
  summariseTx({
    statusName,
    recipient: CONTRACT_ADDRESS,
    txExecutionResultName: 'FINISHED_WITH_RETURN',
    ...extra,
  });

/** Drive trackStep over a scripted sequence of reads at 4 s cadence, as the page does. */
function run(reads: TxSummary[], stepMs = 4000) {
  let lifecycle: Observed[] = [];
  const steps = [];
  for (let i = 0; i < reads.length; i++) {
    const s = trackStep({ startedAt: T0, lifecycle }, reads[i], T0 + i * stepMs);
    lifecycle = s.lifecycle;
    steps.push(s);
    if (s.done) break;
  }
  return steps;
}

describe('lifecycle tracker', () => {
  it('ends at FINALIZED and never stops at the first UNINITIALIZED', () => {
    const steps = run([
      UNKNOWN,
      UNKNOWN,
      tx('PENDING'),
      tx('PROPOSING'),
      tx('COMMITTING'),
      tx('REVEALING'),
      tx('ACCEPTED'),
      tx('FINALIZED'),
    ]);
    expect(steps[0].done).toBeNull();
    expect(steps[0].notFound).toBe('not_indexed_yet');
    expect(steps).toHaveLength(8);
    const last = steps[steps.length - 1];
    expect(last.done).toBe('terminal');
    expect(last.tx?.status).toBe('FINALIZED');
    expect(last.tx?.succeeded).toBe(true);
    expect(last.lifecycle.map((o) => o.status)).toEqual([
      'PENDING',
      'PROPOSING',
      'COMMITTING',
      'REVEALING',
      'ACCEPTED',
      'FINALIZED',
    ]);
  });

  it('stops after 60 s of UNINITIALIZED and not before', () => {
    const at = (ms: number) => trackStep({ startedAt: T0, lifecycle: [] }, UNKNOWN, T0 + ms);
    expect(at(NOT_INDEXED_GRACE_MS - 4000).done).toBeNull();
    expect(at(NOT_INDEXED_GRACE_MS - 4000).notFound).toBe('not_indexed_yet');
    const past = at(NOT_INDEXED_GRACE_MS);
    expect(past.notFound).toBe('absent');
    expect(past.done).toBe('terminal');
  });

  it('keeps watching through a failed read and reports it', () => {
    const s = trackStep(
      { startedAt: T0, lifecycle: [] },
      { ok: false, why: 'rpc down' },
      T0 + 4000,
    );
    expect(s.error).toBe('rpc down');
    expect(s.done).toBeNull();
  });

  it('lists a recurring status again (position-keyed) and not twice in a row', () => {
    const steps = run([
      tx('ACCEPTED'),
      tx('ACCEPTED'),
      tx('APPEAL_COMMITTING'),
      tx('ACCEPTED'),
      tx('FINALIZED'),
    ]);
    const statuses = steps[steps.length - 1].lifecycle.map((o, i) => `${i}-${o.status}`);
    expect(statuses).toEqual(['0-ACCEPTED', '1-APPEAL_COMMITTING', '2-ACCEPTED', '3-FINALIZED']);
  });

  it('UNDETERMINED, CANCELED and the two timeouts end the watch without success', () => {
    for (const status of ['UNDETERMINED', 'CANCELED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT']) {
      const s = trackStep(
        { startedAt: T0, lifecycle: [] },
        tx(status, { txExecutionResultName: 'NOT_VOTED' }),
        T0,
      );
      expect(s.done).toBe('terminal');
      expect(s.tx?.succeeded).toBe(false);
    }
  });

  it('FINALIZED with a failed execution is not success', () => {
    const t = tx('FINALIZED', { txExecutionResultName: 'FINISHED_WITH_ERROR' });
    expect(t.ok && t.found && t.settledButFailed).toBe(true);
    expect(t.ok && t.found && t.succeeded).toBe(false);
  });

  it('gives up after the watch limit', () => {
    const s = trackStep({ startedAt: T0, lifecycle: [] }, tx('PROPOSING'), T0 + 16 * 60 * 1000);
    expect(s.done).toBe('limit');
  });

  it("knows a transaction to another contract is not this contract's", () => {
    const t = tx('FINALIZED', { recipient: '0x' + '1'.repeat(40) });
    expect(t.ok && t.found && t.forThisContract).toBe(false);
  });
});

// Mocked RPC responses (shapes of list_by_receipt / get_attestation).
const MOCK_RPC: Record<string, unknown> = {
  list_by_receipt: JSON.stringify(['att1']),
  get_attestation: new Map<string, unknown>([
    ['receipt_id', ID],
    ['receipt_sha256', 'b'.repeat(64)],
    ['rail', 'x402-base'],
    ['chain_id', '8453'],
    ['payment_tx', '0x' + 'c'.repeat(64)],
    ['payer', '0x' + '1'.repeat(40)],
    ['payee', '0x' + '2'.repeat(40)],
    ['amount_atomic', '10000'],
    ['tool', 'x.y'],
    ['upstream_status', 200n],
    ['billed', true],
    ['response_sha256', 'd'.repeat(64)],
    ['result', 'PASS'],
    ['observation', 'payment_matches'],
    ['checked_at', '2026-10-20T07:00:00Z'],
    ['requester', '0x' + '3'.repeat(40)],
  ]),
};

describe('read path from a mocked RPC', () => {
  it('parses the id list and separates empty from unreadable', () => {
    expect(parseIdList(MOCK_RPC.list_by_receipt)).toEqual({ ok: true, ids: ['att1'] });
    expect(parseIdList('[]')).toEqual({ ok: true, ids: [] });
    expect(parseIdList(null).ok).toBe(false);
    expect(parseIdList('not json').ok).toBe(false);
    expect(parseIdList('[1]').ok).toBe(false);
  });

  it('renders an attestation exactly as the contract returned it', () => {
    const c = attestationCard('att1', MOCK_RPC.get_attestation);
    if (!c.ok) throw new Error('card refused');
    expect(c.result).toBe('PASS');
    expect(c.recognised).toBe(true);
    expect(c.observation).toBe('payment_matches');
    expect(c.upstream_status).toBe('200');
    expect(c.billed).toBe('true');
  });

  it('a missing field is null, an unknown result is flagged, a non-object is refused', () => {
    const c = attestationCard('x', { result: 'MAYBE' });
    if (!c.ok) throw new Error('card refused');
    expect(c.observation).toBeNull();
    expect(c.recognised).toBe(false);
    expect(attestationCard('x', 'nope').ok).toBe(false);
    expect(attestationCard('x', [1]).ok).toBe(false);
  });

  it('shows the receipt fields and refuses a foreign schema', () => {
    const v = receiptView({
      schema: 'apibase-receipt/1',
      receipt_id: ID,
      tool: 'x.y',
      amount_atomic: '10000',
      extra: 'ignored',
    });
    if (!v.ok) throw new Error('refused');
    expect(v.fields.find(([k]) => k === 'tool')?.[1]).toBe('x.y');
    expect(v.fields.find(([k]) => k === 'payer')?.[1]).toBe('not returned');
    expect(v.fields.some(([k]) => k === 'extra')).toBe(false);
    expect(receiptView({ schema: 'other' }).ok).toBe(false);
    expect(usdcFromAtomic('10000')).toBe('0.010000');
    expect(usdcFromAtomic('12345678')).toBe('12.345678');
    expect(usdcFromAtomic('1.5')).toBeNull();
  });

  it('decodes input safely', () => {
    expect(parseReceiptId(ID)).toBe(ID);
    expect(parseReceiptId('ABC')).toBeNull();
    expect(parseReceiptId(['a'])).toBeNull();
    expect(receiptFromQuery(`?r=${ID}`)).toBe(ID);
    expect(receiptFromQuery('')).toBeNull();
    expect(readableError({ code: 4001 })).toMatch(/rejected in the wallet/);
    expect(readableError(new Error("unknown attest_id 'zz'"))).toMatch(/unknown attest_id 'zz'/);
  });
});

describe('wallet-less state', () => {
  it('disables the button with a reason and still has the read path', () => {
    expect(attestBlockReason(false, ID)).toMatch(/No browser wallet/);
    expect(attestBlockReason(true, null)).toMatch(/receipt id/);
    expect(attestBlockReason(true, ID)).toBeNull();
    const html = readFileSync(join(ROOT, 'static/attest/index.html'), 'utf-8');
    expect(html).toMatch(/<button id="attest-btn"[^>]* disabled>/);
    expect(html).toContain('id="attestations"');
  });
});

describe('page and pins', () => {
  const html = readFileSync(join(ROOT, 'static/attest/index.html'), 'utf-8');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

  it('carries the required copy and the v0 limits', () => {
    expect(html).toContain(
      'Attestations are produced by GenLayer validators, each of which fetches this receipt and the USDC transfer on Base independently; APIbase cannot alter the result.',
    );
    expect(html).toMatch(/only x402 calls settled on Base, and only billed calls/);
    expect(html).toContain('testnet-faucet.genlayer.foundation');
    expect(html).toContain('chain 4221');
  });

  it('pins genlayer-js to an exact version and ships the bundle', () => {
    expect(pkg.devDependencies['genlayer-js']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(existsSync(join(ROOT, 'static/attest/attest.js'))).toBe(true);
  });

  it('holds no secret and no relay', () => {
    const src = ['attest-view.ts', 'chain.ts', 'entry.ts']
      .map((f) => readFileSync(join(ROOT, 'scripts/attest', f), 'utf-8'))
      .join('\n');
    expect(src).not.toMatch(/privateKey|PRIVATE_KEY|generatePrivateKey|createAccount|innerHTML/);
    expect(src).not.toMatch(/fetch\(\s*['"`]\/api/);
  });
});
