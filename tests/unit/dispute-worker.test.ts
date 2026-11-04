/**
 * A-GD-01: the dispute verdict lane with stubs only. No transaction is sent anywhere: the GenLayer
 * port, Base, the receipt store and the ledger are in-memory fakes.
 */
import {
  runDisputeVerdicts,
  type DisputeCfg,
  type GlPort,
  type VerdictRow,
  type WorkerDeps,
  type WorkerStore,
} from '../../src/payments/dispute-worker';
import type { RefundOwedInput } from '../../src/services/refund-ledger.service';

const PAYER = '0x' + 'a1'.repeat(20);
const PAYEE = '0x50ebda9da5dc19c302ca059d7b9e06e264936480';
const TX = '0x' + 'c3'.repeat(32);
const TX2 = '0x' + 'c4'.repeat(32);
const D1 = 'd1'.repeat(32);
const D2 = 'd2'.repeat(32);
const RID = 'b'.repeat(32);

const CFG: DisputeCfg = {
  receiptContract: '0x' + '1'.repeat(40),
  paymentContract: '',
  confirm: true,
  hasKey: true,
  perRefundAtomic: '25000000',
  payee: PAYEE,
  refundWindowHours: 72,
};

interface Rig {
  deps: WorkerDeps;
  sends: Array<{ target: string; fn: string; args: unknown[] }>;
  booked: RefundOwedInput[];
  alerts: Array<{ kind: string; payload: Record<string, unknown> }>;
  verdicts: Map<string, VerdictRow>;
  ledgerSent: Set<string>;
}

function rig(
  disputes: Record<string, Record<string, unknown>>,
  opts: {
    cfg?: Partial<DisputeCfg>;
    receipts?: Record<string, string>;
    index?: Record<string, { receipt_ids: string[]; refund_tx: string | null }>;
    chain?: Record<
      string,
      {
        status: number;
        transfers: Array<{ from: string; to: string; value_atomic: string }>;
      } | null
    >;
    existingRefundFor?: string[];
    bookFails?: boolean;
  } = {},
): Rig {
  const sends: Rig['sends'] = [];
  const booked: RefundOwedInput[] = [];
  const alerts: Rig['alerts'] = [];
  const verdicts = new Map<string, VerdictRow>();
  const ledgerSent = new Set<string>();
  const ledger = new Map<string, string>(); // dispute_id -> refund_id
  const gl: GlPort = {
    async call(_t, fn, args) {
      if (fn === 'list_recent') return JSON.stringify(Object.keys(disputes));
      if (fn === 'get_dispute') return JSON.stringify(disputes[String(args[0])]);
      throw new Error(`unexpected read ${fn}`);
    },
    async send(target, fn, args) {
      sends.push({ target, fn, args });
      return '0xgl';
    },
  };
  const store: WorkerStore = {
    judged: async (ids) =>
      new Set(ids.filter((i) => verdicts.has(i) && verdicts.get(i)!.outcome !== 'over_cap')),
    overCapIds: async (ids) => new Set(ids.filter((i) => verdicts.get(i)?.outcome === 'over_cap')),
    saveVerdict: async (v) => void verdicts.set(v.dispute_id, v),
    refundExistsFor: async (tx, rid) =>
      (opts.existingRefundFor ?? []).some((k) => k === tx || k === rid),
    bookedFor: async (id) => ledger.get(id) ?? null,
    otherBookedVerdict: async (tx, id) =>
      [...verdicts.values()].find(
        (v) => v.payment_tx === tx && v.outcome === 'booked' && v.dispute_id !== id,
      )?.dispute_id ?? null,
    book: async (row) => {
      if (opts.bookFails) return;
      booked.push(row);
      ledger.set(row.source_id, `refund-${booked.length}`);
    },
    confirmable: async () =>
      [...verdicts.values()]
        .filter(
          (v) => v.outcome === 'booked' && !done.has(v.dispute_id) && ledgerSent.has(v.dispute_id),
        )
        .map((v) => ({ dispute_id: v.dispute_id, claim: v.claim })),
    setConfirm: async (id, state) => void (state === 'done' ? done.add(id) : done.add(id)),
    overdue: async () => [],
    markOverdueAlerted: async () => undefined,
    newReceiptFlags: async () => 0,
    unfiledFlags: async () => [],
    markFiled: async () => undefined,
    markFileError: async () => undefined,
    alert: async (kind, payload) => void alerts.push({ kind, payload }),
  };
  const done = new Set<string>();
  const deps: WorkerDeps = {
    cfg: { ...CFG, ...opts.cfg },
    gl,
    store,
    log: () => undefined,
    facts: {
      receiptBody: async (id) => opts.receipts?.[id] ?? null,
      index: async (tx) => ({
        payment_tx: tx,
        ...(opts.index?.[tx] ?? { receipt_ids: [], refund_tx: null }),
      }),
      baseTx: async (tx) => (opts.chain && tx in opts.chain ? opts.chain[tx] : null),
    },
  };
  return { deps, sends, booked, alerts, verdicts, ledgerSent };
}

const receiptBody = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schema: 'apibase-receipt/1',
    rail: 'x402-base',
    billed: true,
    upstream_status: 503,
    payer: PAYER,
    amount_atomic: '1000000',
    ...over,
  });

const rec = (over: Record<string, unknown> = {}) => ({
  claim: 'upstream_failed_but_billed',
  receipt_id: RID,
  payment_tx: TX,
  payer: PAYER,
  amount_atomic: '1000000',
  verdict: 'REFUND',
  ...over,
});

const PAID = {
  [TX]: { status: 1, transfers: [{ from: PAYER, to: PAYEE, value_atomic: '250000' }] },
};

describe('dispute verdict lane', () => {
  it('REFUND + matching recompute -> one ledger row, no payment, no refund-wallet call', async () => {
    const r = rig({ [D1]: rec() }, { receipts: { [RID]: receiptBody() } });
    const s = await runDisputeVerdicts(r.deps);
    expect(s.booked).toBe(1);
    expect(r.booked).toEqual([
      expect.objectContaining({
        rail: 'base',
        payer: PAYER,
        amount_usd: '1.000000',
        reason: 'upstream_failed_but_billed',
        source_kind: 'request',
        source_id: D1,
        receipt_id: RID,
        original_tx: TX,
      }),
    ]);
    expect(r.verdicts.get(D1)?.outcome).toBe('booked');
    expect(r.sends).toEqual([]); // nothing signed: confirm waits for the ledger row to be sent
  });

  it('paid_without_receipt: recomputed from the index and Base, booked once', async () => {
    const r = rig(
      { [D1]: rec({ claim: 'paid_without_receipt', receipt_id: '', amount_atomic: '250000' }) },
      { chain: PAID },
    );
    const s = await runDisputeVerdicts(r.deps);
    expect(s.booked).toBe(1);
    expect(r.booked[0]).toMatchObject({
      amount_usd: '0.250000',
      receipt_id: null,
      original_tx: TX,
    });
  });

  it('mismatch (the recompute says RELEASE) -> zero rows and a DISPUTE_VERDICT_MISMATCH alert with both computations', async () => {
    const r = rig({ [D1]: rec() }, { receipts: { [RID]: receiptBody({ upstream_status: 200 }) } });
    const s = await runDisputeVerdicts(r.deps);
    expect(s.mismatches).toBe(1);
    expect(r.booked).toEqual([]);
    expect(r.verdicts.get(D1)?.outcome).toBe('mismatch');
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0].kind).toBe('DISPUTE_VERDICT_MISMATCH');
    expect(r.alerts[0].payload).toMatchObject({
      dispute_id: D1,
      contract: expect.objectContaining({ amount_atomic: '1000000' }),
      local: { verdict: 'RELEASE', reason: 'upstream_status_200' },
    });
  });

  it('a different amount in the verdict is a mismatch even when both say REFUND', async () => {
    const r = rig(
      { [D1]: rec({ amount_atomic: '9000000' }) },
      { receipts: { [RID]: receiptBody() } },
    );
    await runDisputeVerdicts(r.deps);
    expect(r.booked).toEqual([]);
    expect(r.alerts[0].kind).toBe('DISPUTE_VERDICT_MISMATCH');
  });

  it('a receipt the store does not hold is a mismatch, not a payment', async () => {
    const r = rig({ [D1]: rec() });
    await runDisputeVerdicts(r.deps);
    expect(r.booked).toEqual([]);
    expect(r.verdicts.get(D1)?.outcome).toBe('mismatch');
  });

  it('the same payment_tx twice -> one row; the second verdict is a no-op', async () => {
    const r = rig(
      {
        [D1]: rec({ claim: 'paid_without_receipt', receipt_id: '', amount_atomic: '250000' }),
        [D2]: rec({ claim: 'paid_without_receipt', receipt_id: '', amount_atomic: '250000' }),
      },
      { chain: PAID },
    );
    const s = await runDisputeVerdicts(r.deps);
    expect(r.booked).toHaveLength(1);
    expect(s.booked).toBe(1);
    expect(s.duplicates).toBe(1);
    expect(r.verdicts.get(D2)?.outcome).toBe('duplicate_tx');
    expect(r.alerts).toEqual([]);
  });

  it('an existing ledger row for the payment tx (or the receipt) makes the verdict a no-op with no incident', async () => {
    const r = rig({ [D1]: rec() }, { receipts: { [RID]: receiptBody() }, existingRefundFor: [TX] });
    const s = await runDisputeVerdicts(r.deps);
    expect(s.duplicates).toBe(1);
    expect(r.booked).toEqual([]);
    expect(r.alerts).toEqual([]);
    expect(r.verdicts.get(D1)?.outcome).toBe('duplicate_tx');
  });

  it('a verdict above the per-refund cap is queued for the operator, not booked', async () => {
    const r = rig(
      { [D1]: rec({ amount_atomic: '25000001' }) },
      { receipts: { [RID]: receiptBody({ amount_atomic: '25000001' }) } },
    );
    const s = await runDisputeVerdicts(r.deps);
    expect(s.overCap).toBe(1);
    expect(r.booked).toEqual([]);
    expect(r.alerts.map((a) => a.kind)).toEqual(['dispute_over_cap']);
    expect(r.verdicts.get(D1)?.outcome).toBe('over_cap');
  });

  it('an over-cap verdict is re-judged against the current cap: raised -> booked next pass', async () => {
    const r = rig(
      { [D1]: rec({ amount_atomic: '25000001' }) },
      { receipts: { [RID]: receiptBody({ amount_atomic: '25000001' }) } },
    );
    await runDisputeVerdicts(r.deps);
    await runDisputeVerdicts(r.deps); // still over the cap: silent, no second alert
    expect(r.alerts).toHaveLength(1);
    expect(r.booked).toEqual([]);
    r.deps.cfg.perRefundAtomic = '30000000';
    const s = await runDisputeVerdicts(r.deps);
    expect(s.booked).toBe(1);
    expect(r.booked).toHaveLength(1);
    expect(r.verdicts.get(D1)?.outcome).toBe('booked');
  });

  it('exactly the cap is booked', async () => {
    const r = rig(
      { [D1]: rec({ amount_atomic: '25000000' }) },
      { receipts: { [RID]: receiptBody({ amount_atomic: '25000000' }) } },
    );
    expect((await runDisputeVerdicts(r.deps)).booked).toBe(1);
  });

  it('a RELEASE verdict books nothing and is remembered', async () => {
    const r = rig({ [D1]: rec({ verdict: 'RELEASE' }) });
    const s = await runDisputeVerdicts(r.deps);
    expect(s.released).toBe(1);
    expect(r.booked).toEqual([]);
    expect(r.verdicts.get(D1)?.outcome).toBe('released');
  });

  it('a ledger write that failed is retried next pass (the verdict is not remembered)', async () => {
    const r = rig({ [D1]: rec() }, { receipts: { [RID]: receiptBody() }, bookFails: true });
    await runDisputeVerdicts(r.deps);
    expect(r.verdicts.has(D1)).toBe(false);
  });

  it('judged ids are not judged again', async () => {
    const r = rig({ [D1]: rec() }, { receipts: { [RID]: receiptBody() } });
    await runDisputeVerdicts(r.deps);
    await runDisputeVerdicts(r.deps);
    expect(r.booked).toHaveLength(1);
  });

  it('confirm_refund is sent only once the booked row is sent, from the dispute key', async () => {
    const r = rig({ [D1]: rec() }, { receipts: { [RID]: receiptBody() } });
    await runDisputeVerdicts(r.deps);
    expect(r.sends).toEqual([]);
    r.ledgerSent.add(D1);
    const s = await runDisputeVerdicts(r.deps);
    expect(s.confirmed).toBe(1);
    expect(r.sends).toEqual([{ target: 'receipt', fn: 'confirm_refund', args: [D1] }]);
    await runDisputeVerdicts(r.deps);
    expect(r.sends).toHaveLength(1);
  });

  it('confirm_refund goes to the contract of the claim (payment claim -> payment contract)', async () => {
    const r = rig(
      { [D1]: rec({ claim: 'paid_without_receipt', receipt_id: '', amount_atomic: '250000' }) },
      { chain: PAID, cfg: { receiptContract: '', paymentContract: '0x' + '2'.repeat(40) } },
    );
    await runDisputeVerdicts(r.deps);
    r.ledgerSent.add(D1);
    await runDisputeVerdicts(r.deps);
    expect(r.sends).toEqual([{ target: 'payment', fn: 'confirm_refund', args: [D1] }]);
  });

  it('confirm_refund is never sent while cfg.confirm is off (not in the merged contracts)', async () => {
    const r = rig({ [D1]: rec() }, { receipts: { [RID]: receiptBody() }, cfg: { confirm: false } });
    await runDisputeVerdicts(r.deps);
    r.ledgerSent.add(D1);
    const s = await runDisputeVerdicts(r.deps);
    expect(s.confirmed).toBe(0);
    expect(r.sends).toEqual([]);
  });

  it('reads list_recent / get_dispute on each configured contract separately', async () => {
    const r = rig({}, { cfg: { paymentContract: '0x' + '2'.repeat(40) } });
    const calls: string[] = [];
    r.deps.gl.call = async (target, fn, args) => {
      calls.push(`${target}:${fn}`);
      if (fn === 'list_recent') return JSON.stringify(target === 'receipt' ? [D1] : [D2]);
      return JSON.stringify(
        target === 'receipt'
          ? rec({ verdict: 'RELEASE' })
          : rec({ claim: 'paid_without_receipt', verdict: 'RELEASE', receipt_id: '' }),
      );
    };
    const s = await runDisputeVerdicts(r.deps);
    expect(s.seen).toBe(2);
    expect(s.judged).toBe(2);
    expect(calls).toEqual([
      'receipt:list_recent',
      'receipt:get_dispute',
      'payment:list_recent',
      'payment:get_dispute',
    ]);
  });

  it('only the payment contract set: the receipt contract is never read', async () => {
    const r = rig({}, { cfg: { receiptContract: '', paymentContract: '0x' + '2'.repeat(40) } });
    const seen: string[] = [];
    r.deps.gl.call = async (target, fn) => {
      seen.push(target);
      return fn === 'list_recent' ? '[]' : '{}';
    };
    const s = await runDisputeVerdicts(r.deps);
    expect(s.disabled).toBeUndefined();
    expect(seen).toEqual(['payment']);
  });

  it('without GL_DISPUTE_CONTRACT the lane is off: no read, no write, no crash', async () => {
    const r = rig({ [D1]: rec() }, { cfg: { receiptContract: '' } });
    const call = jest.spyOn(r.deps.gl, 'call');
    const s = await runDisputeVerdicts(r.deps);
    expect(s.disabled).toBe(true);
    expect(call).not.toHaveBeenCalled();
    expect(r.sends).toEqual([]);
  });

  it('a failing GenLayer read ends the pass quietly', async () => {
    const r = rig({});
    r.deps.gl.call = async () => {
      throw new Error('rpc down');
    };
    await expect(runDisputeVerdicts(r.deps)).resolves.toMatchObject({ judged: 0 });
  });
});

describe('filing lane', () => {
  function fileRig(hasKey: boolean, failSend = false) {
    const r = rig({}, { cfg: { hasKey, paymentContract: '0x' + '2'.repeat(40) } });
    const flags = [
      { flag_id: 'f1', claim: 'upstream_failed_but_billed' as const, subject: RID },
      { flag_id: 'f2', claim: 'paid_without_receipt' as const, subject: TX2 },
    ];
    const filed: string[] = [];
    const errors: string[] = [];
    r.deps.store.unfiledFlags = async () =>
      flags.filter((f) => !filed.includes(f.flag_id) && !errors.includes(f.flag_id));
    r.deps.store.markFiled = async (id) => void filed.push(id);
    r.deps.store.markFileError = async (id) => void errors.push(id);
    if (failSend)
      r.deps.gl.send = async () => {
        throw new Error('boom');
      };
    return { r, filed, errors };
  }

  it('files dispute_receipt / dispute_payment from the dispute key, never refunds anything', async () => {
    const { r, filed } = fileRig(true);
    const s = await runDisputeVerdicts(r.deps);
    expect(s.filed).toBe(2);
    expect(filed).toEqual(['f1', 'f2']);
    expect(r.sends).toEqual([
      { target: 'receipt', fn: 'dispute_receipt', args: [RID] },
      { target: 'payment', fn: 'dispute_payment', args: ['8453', TX2] },
    ]);
    expect(r.booked).toEqual([]);
  });

  it('a claim whose contract is not configured stays unfiled', async () => {
    const { r, filed } = fileRig(true);
    r.deps.cfg.paymentContract = '';
    await runDisputeVerdicts(r.deps);
    expect(filed).toEqual(['f1']);
    expect(r.sends.map((x) => x.fn)).toEqual(['dispute_receipt']);
  });

  it('without GL_DISPUTE_KEY nothing is filed', async () => {
    const { r } = fileRig(false);
    await runDisputeVerdicts(r.deps);
    expect(r.sends).toEqual([]);
  });

  it('a failed filing is recorded and alerted, not retried', async () => {
    const { r, errors } = fileRig(true, true);
    await runDisputeVerdicts(r.deps);
    expect(errors).toEqual(['f1', 'f2']);
    expect(r.alerts.map((a) => a.kind)).toEqual(['dispute_filing_failed', 'dispute_filing_failed']);
    await runDisputeVerdicts(r.deps);
    expect(r.alerts).toHaveLength(2);
  });
});
