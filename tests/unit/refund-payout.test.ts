/**
 * T-0553: refund payout engine with a fake chain, fake store, fake signer and a fake clock.
 * Nothing here touches a network, a database or a real key.
 */
jest.mock('../../src/config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({ getX402Config: jest.fn() }));
jest.mock('../../src/config/mpp.config', () => ({ getMppConfig: jest.fn() }));
jest.mock('../../src/payments/operator-signer', () => ({ getOperatorWallet: jest.fn() }));
jest.mock('../../src/payments/operator-lock', () => ({ withOperatorLock: jest.fn() }));
jest.mock('../../src/payments/local-facilitator', () => ({
  encodeTransferWithAuthorization: jest.fn(),
}));

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import {
  recoverPayouts,
  runPayout,
  selectBatches,
  threshold,
  toMicro,
  type Alert,
  type Batch,
  type ChainStatus,
  type Deps,
  type OwedRow,
  type Payout,
  type Rail,
  type RailChain,
  type RefundCfg,
  type Store,
} from '../../src/refunds/refund-payout.core';
import {
  baseFeeUsd,
  evaluateKeys,
  refundNonce,
  resetKeyLogMemo,
  tempoFeeUsd,
} from '../../src/refunds/refund-chains';
import { FeeUnavailableError } from '../../src/refunds/refund-payout.core';

const NOW = new Date('2026-11-09T07:00:00Z');
const DAY = 86_400_000;
const CFG: RefundCfg = {
  enabled: true,
  dryRun: false,
  minPayoutUsd: 0.01,
  feeMultiple: 10,
  runCapUsd: 50,
  periodCapUsd: 200,
  payerRunCapUsd: 25,
  ceilingUsd: 100,
  lowBalanceUsd: 10,
  carryMaxDays: 90,
};
const A = '0x00000000000000000000000000000000000a11ce';
const B = '0x0000000000000000000000000000000000000b0b';

let seq = 0;
const row = (payer: string, usd: number, ageDays: number, rail: Rail = 'base'): OwedRow => ({
  refund_id: `r${++seq}`,
  rail,
  payer,
  micro: toMicro(usd),
  detected_at: new Date(NOW.getTime() - ageDays * DAY),
});

class FakeStore implements Store {
  rows: Array<OwedRow & { status: string; payout_id?: string; refund_tx?: string | null }> = [];
  payouts: Payout[] = [];
  outbox: Array<{ type: string; payload: Record<string, unknown> }> = [];
  sentMicro = 0;
  constructor(rows: OwedRow[]) {
    this.rows = rows.map((r) => ({ ...r, status: 'owed' }));
  }
  async owedRows(rail: Rail) {
    return this.rows.filter((r) => r.status === 'owed' && r.rail === rail);
  }
  async sentMicroSince() {
    return this.sentMicro;
  }
  async createPayout(b: Batch, rail: Rail, fee: number) {
    const sel = this.rows.filter((r) => b.rowIds.includes(r.refund_id) && r.status === 'owed');
    if (sel.length !== b.rowIds.length) return null;
    const p: Payout = {
      payout_id: `p${this.payouts.length + 1}`,
      rail,
      payer: b.payer,
      micro: b.micro,
      status: 'signing',
      nonce: null,
      tx_hash: null,
      raw_tx: null,
      valid_before: null,
      fee_usd_est: fee,
      created_at: NOW,
    };
    sel.forEach((r) => ((r.status = 'scheduled'), (r.payout_id = p.payout_id)));
    this.payouts.push(p);
    return { ...p };
  }
  rowPayersOverride: string[] | null = null;
  async payoutRowPayers(id: string) {
    return (
      this.rowPayersOverride ?? [
        ...new Set(this.rows.filter((r) => r.payout_id === id).map((r) => r.payer)),
      ]
    );
  }
  async livePayouts() {
    return this.payouts
      .filter((p) => ['signing', 'signed', 'broadcast'].includes(p.status))
      .map((p) => ({ ...p }));
  }
  async patch(id: string, patch: Partial<Payout> & { error?: string }) {
    const p = this.payouts.find((x) => x.payout_id === id)!;
    for (const [k, v] of Object.entries(patch))
      if (v !== undefined && v !== null) (p as any)[k] = v;
  }
  async markSent(id: string, tx: string | null) {
    this.payouts.find((x) => x.payout_id === id)!.status = 'sent';
    this.rows
      .filter((r) => r.payout_id === id)
      .forEach((r) => ((r.status = 'sent'), (r.refund_tx = tx)));
  }
  async release(id: string, status: 'expired' | 'failed') {
    this.payouts.find((x) => x.payout_id === id)!.status = status;
    this.rows
      .filter((r) => r.payout_id === id && r.status === 'scheduled')
      .forEach((r) => {
        r.status = 'owed';
        r.payout_id = undefined;
      });
  }
  async writeOutbox(type: any, payload: Record<string, unknown>) {
    this.outbox.push({ type, payload });
  }
  alerts(): Alert[] {
    return this.outbox.filter((o) => o.type === 'refund_alert').map((o) => o.payload as Alert);
  }
}

interface FakeChain extends RailChain {
  signs: number;
  broadcasts: Array<{ nonce: string | null; raw: string | null }>;
  onChainState: ChainStatus;
  crashAfterSign: boolean;
  nonceSeed: () => string;
}
function fakeChain(
  rail: Rail,
  o: { balance?: number; fee?: number; feeThrows?: boolean } = {},
): FakeChain {
  const c: FakeChain = {
    rail,
    feeFromRefundWallet: rail === 'tempo',
    signs: 0,
    broadcasts: [],
    onChainState: { state: 'unsent' },
    crashAfterSign: false,
    // deterministic nonce derived from the payout id (the production rule)
    nonceSeed: () => '',
    async balanceUsd() {
      return o.balance ?? 30;
    },
    async feeUsd() {
      if (o.feeThrows) throw new FeeUnavailableError('ETH/USD outside the sanity band');
      return o.fee ?? 0.001;
    },
    async sign(p) {
      c.signs += 1;
      return {
        nonce: refundNonce(p.payout_id),
        rawTx: 'raw:' + p.payout_id,
        txHash: null,
        validBefore: new Date(NOW.getTime() + 3600_000),
      };
    },
    async broadcast(p) {
      c.broadcasts.push({ nonce: p.nonce, raw: p.raw_tx });
      if (c.crashAfterSign) throw new Error('boom');
      return { txHash: '0xtx' + p.payout_id, success: true };
    },
    async status() {
      return c.onChainState;
    },
  };
  return c;
}

function deps(
  store: Store,
  chains: Partial<Record<Rail, RailChain>> = {},
  over: Partial<Deps> = {},
): Deps {
  return {
    cfg: CFG,
    store,
    chains: { base: chains.base ?? fakeChain('base'), tempo: chains.tempo ?? fakeChain('tempo') },
    keyState: { base: 'ok', tempo: 'ok' },
    killed: () => false,
    now: () => NOW,
    log: () => undefined,
    ...over,
  };
}

describe('threshold math', () => {
  it('base: live fee inputs -> USD, floor at the minimum', () => {
    // (1 gwei + 0.01 gwei) * 80000 + 5e12 wei L1 at 2266 USD/ETH
    const fee = baseFeeUsd(1_000_000_000n, 10_000_000n, 5_000_000_000_000n, 2266);
    expect(fee).toBeCloseTo(((1.01e9 * 80_000 + 5e12) / 1e18) * 2266, 8);
    expect(threshold(CFG, fee)).toBe(Math.max(0.01, 10 * fee));
    expect(threshold(CFG, 0.00001)).toBe(0.01);
  });
  it('base: ETH/USD outside 500..20000 refuses the estimate', () => {
    expect(() => baseFeeUsd(1n, 1n, 1n, 100)).toThrow(FeeUnavailableError);
    expect(() => baseFeeUsd(1n, 1n, 1n, 50_000)).toThrow(FeeUnavailableError);
  });
  it('tempo: attodollars per gas x 400000 / 1e18', () => {
    expect(tempoFeeUsd(600_000_000n)).toBeCloseTo(2.4e-4, 12);
  });
});

describe('selection', () => {
  const sel = (
    rows: OwedRow[],
    over: Partial<Parameters<typeof selectBatches>[0]> = {},
    cfg = CFG,
  ) =>
    selectBatches(
      {
        rows,
        now: NOW,
        cfg,
        feeUsd: 0.001,
        feeFromRefundWallet: false,
        balanceUsd: 30,
        runMicroSoFar: 0,
        periodMicroSent: 0,
        ...over,
      },
      'base',
    );
  it('pays a payer at or above max(min, multiple x fee), not below', () => {
    expect(sel([row(A, 0.011, 2)]).batches).toHaveLength(1);
    expect(sel([row(A, 0.005, 2)]).batches).toHaveLength(0);
    expect(sel([row(A, 0.05, 2)], { feeUsd: 0.01 }).batches).toHaveLength(0); // threshold 0.1
  });
  it('rows younger than 24 h wait', () => {
    expect(sel([row(A, 5, 0.5)]).batches).toHaveLength(0);
  });
  it('carry-max: older than 90 days is paid below threshold only when fee <= 50 % of the sum', () => {
    const old = [row(A, 0.05, 100)];
    expect(sel(old, { feeUsd: 0.01 }).batches).toHaveLength(1); // 0.01 <= 0.025
    expect(sel(old, { feeUsd: 0.04 }).batches).toHaveLength(0); // fee too big: stays owed
  });
  it('orders by oldest and stops at the run cap', () => {
    const r = sel([row(B, 20, 3), row(A, 20, 9), row('0xc', 20, 5)], { balanceUsd: 100 });
    expect(r.batches.map((b) => b.payer)).toEqual([A, '0xc']); // 60 > 50 stops the third
  });
  it('period cap counts payouts sent in the last 30 days', () => {
    expect(sel([row(A, 20, 3)], { periodMicroSent: toMicro(190) }).batches).toHaveLength(0);
  });
  it('a payer above the per-payer cap is skipped with an alert, others still paid', () => {
    const r = sel([row(A, 30, 9), row(B, 5, 3)]);
    expect(r.batches.map((b) => b.payer)).toEqual([B]);
    expect(r.alerts.map((a) => a.kind)).toContain('refund_payer_over_cap');
  });
  it('balance below the sum due pays oldest first and alerts low', () => {
    const r = sel([row(A, 10, 9), row(B, 10, 3)], { balanceUsd: 12 });
    expect(r.batches.map((b) => b.payer)).toEqual([A]);
    expect(r.alerts.map((a) => a.kind)).toContain('refund_wallet_low');
  });
  it('tempo reserves the fee from the wallet balance', () => {
    const r = selectBatches(
      {
        rows: [row(A, 10, 3, 'tempo')],
        now: NOW,
        cfg: CFG,
        feeUsd: 0.5,
        feeFromRefundWallet: true,
        balanceUsd: 10.2,
        runMicroSoFar: 0,
        periodMicroSent: 0,
      },
      'tempo',
    );
    expect(r.batches).toHaveLength(0);
  });
});

describe('run', () => {
  it('pays, moves rows owed -> scheduled -> sent, writes the run summary', async () => {
    const store = new FakeStore([row(A, 5, 3)]);
    const base = fakeChain('base');
    const s = await runPayout(deps(store, { base }));
    expect(s.rails.base.paid).toBe(1);
    expect(store.rows[0].status).toBe('sent');
    expect(base.signs).toBe(1);
    expect(store.outbox.some((o) => o.type === 'refund_payout_run')).toBe(true);
  });

  it('dry run signs and broadcasts nothing and reports', async () => {
    const store = new FakeStore([row(A, 5, 3)]);
    const base = fakeChain('base');
    const s = await runPayout(deps(store, { base }, { cfg: { ...CFG, dryRun: true } }));
    expect(base.signs).toBe(0);
    expect(base.broadcasts).toHaveLength(0);
    expect(s.rails.base.payers).toBe(1);
    expect(store.rows[0].status).toBe('owed');
    expect(store.outbox.find((o) => o.type === 'refund_payout_run')).toBeTruthy();
  });

  it('disabled by default config pays nothing', async () => {
    const store = new FakeStore([row(A, 5, 3)]);
    const base = fakeChain('base');
    const s = await runPayout(deps(store, { base }, { cfg: { ...CFG, enabled: false } }));
    expect(s.skipped).toBe('disabled');
    expect(base.signs).toBe(0);
  });

  it('kill file stops before the broadcast; the payout stays signed for recovery', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kill-'));
    const kill = join(dir, 'KILL');
    const store = new FakeStore([row(A, 5, 3)]);
    const base = fakeChain('base');
    const orig = base.sign.bind(base);
    base.sign = async (p) => {
      const r = await orig(p);
      writeFileSync(kill, '1'); // operator drops the file while the run is in flight
      return r;
    };
    // killed() mirrors the job: a present kill file
    const { existsSync } = await import('node:fs');
    await runPayout(deps(store, { base }, { killed: () => existsSync(kill) }));
    expect(base.broadcasts).toHaveLength(0);
    expect(store.payouts[0].status).toBe('signed');
    expect(store.alerts().map((a) => a.kind)).toContain('refund_kill_switch');
  });

  it('ETH/USD out of band skips the rail and alerts; the other rail still runs', async () => {
    const store = new FakeStore([row(A, 5, 3, 'base'), row(B, 5, 3, 'tempo')]);
    const base = fakeChain('base', { feeThrows: true });
    const tempo = fakeChain('tempo');
    const s = await runPayout(deps(store, { base, tempo }));
    expect(base.signs).toBe(0);
    expect(tempo.signs).toBe(1);
    expect(s.rails.base.note).toBe('fee unavailable');
    expect(store.alerts().map((a) => a.kind)).toContain('refund_fee_unavailable');
  });

  it('key mismatch disables that rail only', async () => {
    const store = new FakeStore([row(A, 5, 3, 'base'), row(B, 5, 3, 'tempo')]);
    const base = fakeChain('base');
    const tempo = fakeChain('tempo');
    const s = await runPayout(
      deps(store, { base, tempo }, { keyState: { base: 'mismatch', tempo: 'ok' } }),
    );
    expect(base.signs).toBe(0);
    expect(tempo.signs).toBe(1);
    expect(s.rails.base.note).toBe('key mismatch');
  });

  it('recipient assertion aborts the run with an alert and releases the rows', async () => {
    const store = new FakeStore([row(A, 5, 3)]);
    store.rowPayersOverride = [B];
    const base = fakeChain('base');
    await runPayout(deps(store, { base }));
    expect(base.signs).toBe(0);
    expect(store.rows[0].status).toBe('owed');
    expect(store.alerts().map((a) => a.kind)).toContain('refund_recipient_mismatch');
  });

  it('internal rows are never selected', async () => {
    const store = new FakeStore([row(A, 5, 3)]);
    store.rows[0].status = 'internal';
    const base = fakeChain('base');
    await runPayout(deps(store, { base }));
    expect(base.signs).toBe(0);
  });
});

describe('exactly-once', () => {
  it('crash after signed: next run re-broadcasts the SAME nonce/raw tx, no second payout', async () => {
    const store = new FakeStore([row(A, 5, 3)]);
    const base = fakeChain('base');
    base.crashAfterSign = true;
    await runPayout(deps(store, { base })); // rail error swallowed per rail
    expect(store.payouts).toHaveLength(1);
    expect(store.payouts[0].status).toBe('signed');
    expect(store.payouts[0].nonce).toBe(refundNonce(store.payouts[0].payout_id));
    const first = { ...base.broadcasts[0] };
    base.crashAfterSign = false;
    base.onChainState = { state: 'unsent' };
    await runPayout(deps(store, { base }));
    expect(store.payouts).toHaveLength(1);
    expect(base.signs).toBe(1);
    expect(base.broadcasts[1]).toEqual(first);
    expect(base.broadcasts[1].nonce).toBe(refundNonce(store.payouts[0].payout_id));
    expect(store.payouts[0].status).toBe('sent');
    expect(store.rows[0].status).toBe('sent');
  });

  it('crash after broadcast with receipt success: sent without a new tx', async () => {
    const store = new FakeStore([row(A, 5, 3)]);
    const base = fakeChain('base');
    await store.createPayout(
      { payer: A, rowIds: [store.rows[0].refund_id], micro: store.rows[0].micro },
      'base',
      0.001,
    );
    await store.patch('p1', { status: 'broadcast', nonce: 'n', raw_tx: 'raw', tx_hash: '0xabc' });
    base.onChainState = { state: 'sent', txHash: '0xabc' };
    await recoverPayouts(deps(store, { base }));
    expect(base.broadcasts).toHaveLength(0);
    expect(store.payouts[0].status).toBe('sent');
    expect(store.rows[0].refund_tx).toBe('0xabc');
  });

  it('expired returns the rows to owed', async () => {
    const store = new FakeStore([row(A, 5, 3)]);
    const base = fakeChain('base');
    await store.createPayout(
      { payer: A, rowIds: [store.rows[0].refund_id], micro: store.rows[0].micro },
      'base',
      0.001,
    );
    await store.patch('p1', { status: 'signed', nonce: 'n', raw_tx: 'raw' });
    base.onChainState = { state: 'expired' };
    await recoverPayouts(deps(store, { base }));
    expect(store.payouts[0].status).toBe('expired');
    expect(store.rows[0].status).toBe('owed');
  });

  it('tempo: nonce consumed without our tx -> failed + alert + rows owed', async () => {
    const store = new FakeStore([row(A, 5, 3, 'tempo')]);
    const tempo = fakeChain('tempo');
    await store.createPayout(
      { payer: A, rowIds: [store.rows[0].refund_id], micro: store.rows[0].micro },
      'tempo',
      0.001,
    );
    await store.patch('p1', { status: 'signed', nonce: '3', raw_tx: 'raw' });
    tempo.onChainState = {
      state: 'failed',
      reason: 'account nonce consumed without our transaction',
    };
    await recoverPayouts(deps(store, { tempo }));
    expect(store.payouts[0].status).toBe('failed');
    expect(store.rows[0].status).toBe('owed');
    expect(store.alerts().map((a) => a.kind)).toContain('refund_payout_failed');
  });

  it('recovery does not re-broadcast while the kill switch is on', async () => {
    const store = new FakeStore([row(A, 5, 3)]);
    const base = fakeChain('base');
    await store.createPayout(
      { payer: A, rowIds: [store.rows[0].refund_id], micro: store.rows[0].micro },
      'base',
      0.001,
    );
    await store.patch('p1', { status: 'signed', nonce: 'n', raw_tx: 'raw' });
    await recoverPayouts(deps(store, { base }, { killed: () => true }));
    expect(base.broadcasts).toHaveLength(0);
  });

  it('nonce is derived from the payout id (same payout -> same nonce)', async () => {
    const { refundNonce } = await import('../../src/refunds/refund-chains');
    expect(refundNonce('p-1')).toBe(refundNonce('p-1'));
    expect(refundNonce('p-1')).not.toBe(refundNonce('p-2'));
  });
});

describe('key guard', () => {
  const mk = () => {
    resetKeyLogMemo();
    const dir = mkdtempSync(join(tmpdir(), 'keys-'));
    return { dir, record: join(dir, 'rec.json') };
  };
  // Obviously-test keys (labelled): all-1 and all-2 bytes.
  const TEST_KEY_1 = '0x' + '11'.repeat(32);
  const TEST_KEY_2 = '0x' + '22'.repeat(32);
  const ev = (src: Record<string, string>, forbidden: string[] = []) =>
    evaluateKeys({ source: src as NodeJS.ProcessEnv, forbidden });

  // The container never writes the record; tests write it the way the init script does.
  const writeRec = (record: string, name: string, key: string) => {
    const address = privateKeyToAccount(key as `0x${string}`).address;
    writeFileSync(record, JSON.stringify([{ name, rail: 'base', address, created_at: 'test' }]));
    return address;
  };
  it('absent key and no record -> missing; key without record -> mismatch record_missing, nothing written', () => {
    const { dir, record } = mk();
    expect(ev({ REFUND_WALLET_RECORD: record }).base.state).toBe('missing');
    const before = readdirSync(dir).sort();
    const k = ev({ REFUND_WALLET_RECORD: record, REFUND_SIGNER_KEY_BASE: TEST_KEY_1 });
    expect(k.base.state).toBe('mismatch');
    expect(k.base.reason).toBe('record_missing');
    expect(k.base.address).toBeTruthy();
    expect(readdirSync(dir).sort()).toEqual(before);
  });
  it('record present: key ok; key absent or different key -> mismatch', () => {
    const { record } = mk();
    writeRec(record, 'REFUND_SIGNER_KEY_BASE', TEST_KEY_1);
    expect(
      ev({ REFUND_WALLET_RECORD: record, REFUND_SIGNER_KEY_BASE: TEST_KEY_1 }).base.state,
    ).toBe('ok');
    expect(ev({ REFUND_WALLET_RECORD: record }).base.state).toBe('mismatch');
    expect(
      ev({ REFUND_WALLET_RECORD: record, REFUND_SIGNER_KEY_BASE: TEST_KEY_2 }).base.state,
    ).toBe('mismatch');
  });
  it('refund address equal to the operator or revenue address refuses', () => {
    const { record } = mk();
    const addr = writeRec(record, 'REFUND_SIGNER_KEY_BASE', TEST_KEY_1);
    const r = ev({ REFUND_WALLET_RECORD: record, REFUND_SIGNER_KEY_BASE: TEST_KEY_1 }, [addr]);
    expect(r.base.state).toBe('mismatch');
    expect(r.base.reason).toBe('address_equals_operator_or_revenue');
  });
});

const SCRIPT = resolve(__dirname, '../../scripts/server-wallet-init.sh');
const KEY_RE_SCRIPT = /0x[0-9a-fA-F]{64}/;

function setupSwi() {
  const home = mkdtempSync(join(tmpdir(), 'swi-'));
  mkdirSync(join(home, 'apibase'));
  const env = join(home, 'apibase', '.env');
  writeFileSync(env, 'FOO=bar', { mode: 0o600 }); // no trailing newline on purpose
  return { home, env, record: join(home, 'apibase', 'wallets', 'server-wallets.json') };
}
const runSwi = (home: string, name: string, rail: string) =>
  spawnSync('bash', [SCRIPT, name, rail], {
    env: { PATH: process.env.PATH ?? '', HOME: home },
    encoding: 'utf8',
  });

describe('scripts/server-wallet-init.sh', () => {
  it('generates one key, prints only the address, writes env + record', () => {
    const { home, env, record } = setupSwi();
    const r = runSwi(home, 'REFUND_SIGNER_KEY_BASE', 'base');
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).not.toMatch(KEY_RE_SCRIPT);
    const addr = /address: (0x[0-9a-fA-F]{40})/.exec(r.stdout)?.[1];
    expect(addr).toBeTruthy();
    expect(statSync(env).mode & 0o777).toBe(0o600);
    const lines = readFileSync(env, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('FOO=bar');
    expect(lines[1]).toMatch(/^REFUND_SIGNER_KEY_BASE=0x[0-9a-f]{64}$/);
    const rec = JSON.parse(readFileSync(record, 'utf8'));
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ name: 'REFUND_SIGNER_KEY_BASE', rail: 'base', address: addr });
    expect(statSync(record).mode & 0o777).toBe(0o644);
    expect(statSync(dirname(record)).mode & 0o777).toBe(0o755);
    expect(readdirSync(join(home, 'apibase')).sort()).toEqual(['.env', 'wallets']);
  });

  it('a wallets directory the user cannot write -> exit 3, env untouched, no record', () => {
    const { home, env, record } = setupSwi();
    mkdirSync(dirname(record), { mode: 0o555 });
    const envBefore = readFileSync(env);
    const r = runSwi(home, 'REFUND_SIGNER_KEY_BASE', 'base');
    // A superuser can write anywhere; the guard is meaningful for the real (non-root) operator.
    if (process.getuid && process.getuid() !== 0) {
      expect(r.status).toBe(3);
      expect(r.stderr).toContain('is not writable');
      expect(r.stdout + r.stderr).not.toMatch(KEY_RE_SCRIPT);
      expect(readFileSync(env).equals(envBefore)).toBe(true);
      expect(existsSync(record)).toBe(false);
    }
  });

  it('refuses a second run and changes nothing', () => {
    const { home, env, record } = setupSwi();
    expect(runSwi(home, 'REFUND_SIGNER_KEY_TEMPO', 'tempo').status).toBe(0);
    const envBefore = readFileSync(env, 'utf8');
    const recBefore = readFileSync(record, 'utf8');
    const r = runSwi(home, 'REFUND_SIGNER_KEY_TEMPO', 'tempo');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('replacing a funded key is a hand ceremony');
    expect(r.stdout + r.stderr).not.toMatch(KEY_RE_SCRIPT);
    expect(readFileSync(env, 'utf8')).toBe(envBefore);
    expect(readFileSync(record, 'utf8')).toBe(recBefore);
  });

  it('T-0705: GL_DISPUTE_KEY genlayer -> one env line, one record entry, address and faucet only', () => {
    const { home, env, record } = setupSwi();
    const r = runSwi(home, 'GL_DISPUTE_KEY', 'genlayer');
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).not.toMatch(KEY_RE_SCRIPT);
    expect(r.stdout).toContain('https://testnet-faucet.genlayer.foundation/');
    const addr = /address: (0x[0-9a-fA-F]{40})/.exec(r.stdout)?.[1];
    expect(addr).toBeTruthy();
    const keyLines = readFileSync(env, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('GL_DISPUTE_KEY='));
    expect(keyLines).toHaveLength(1);
    expect(keyLines[0]).toMatch(/^GL_DISPUTE_KEY=0x[0-9a-f]{64}$/);
    const rec = JSON.parse(readFileSync(record, 'utf8'));
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ name: 'GL_DISPUTE_KEY', rail: 'genlayer', address: addr });
    const envBefore = readFileSync(env, 'utf8');
    const again = runSwi(home, 'GL_DISPUTE_KEY', 'genlayer');
    expect(again.status).toBe(2);
    expect(readFileSync(env, 'utf8')).toBe(envBefore);
  });

  it('T-0705: rail solana exits 64 and leaves .env untouched', () => {
    const { home, env } = setupSwi();
    const r = runSwi(home, 'GL_DISPUTE_KEY', 'solana');
    expect(r.status).toBe(64);
    expect(readFileSync(env, 'utf8')).toBe('FOO=bar');
  });

  it('T-0705: record mode accepts genlayer and rejects polygon', () => {
    const { home } = setupSwi();
    const file = join(home, 'rec.json');
    const MJS = resolve(__dirname, '../../scripts/server-wallet-init.mjs');
    const addr = '0x' + 'ab'.repeat(20);
    const ok = spawnSync('node', [MJS, 'record', file, 'X', 'genlayer', addr], {
      encoding: 'utf8',
    });
    expect(ok.status).toBe(0);
    const bad = spawnSync('node', [MJS, 'record', file, 'X', 'polygon', addr], {
      encoding: 'utf8',
    });
    expect(bad.status).toBe(64);
  });

  it('has no replace flag and is referenced by no npm script or workflow', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).not.toMatch(/--replace/);
    const pkg = readFileSync(resolve(__dirname, '../../package.json'), 'utf8');
    expect(pkg).not.toContain('server-wallet-init');
  });
});
