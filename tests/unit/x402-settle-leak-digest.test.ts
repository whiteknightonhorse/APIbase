/**
 * T-0675 — x402 settle-failure alerts are ONE digest per run, not one message per row.
 * Drives build_message()/parse_rows() of scripts/x402-settle-leak-alerts.py with 0, 1 and 164 rows.
 */
import { spawnSync } from 'child_process';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../scripts/x402-settle-leak-alerts.py');

const PY = `
import sys, json, importlib.util
spec = importlib.util.spec_from_file_location("leak", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
n = int(sys.argv[2])
internal = {"0xaaa0"}
raw = "\\n".join(
    "\\x1f".join([str(i), "2026-11-02 12:%02d:00+00" % (i % 60), json.dumps({
        "tool_id": "t.x", "amount_usd": 0.00127, "payer": "0xAAA0" if i % 3 == 0 else "0xb%03d" % i,
        "reason": "settle_returned_failure: invalid_exact_evm_transaction_failed" if i % 5 else "timeout"})])
    for i in range(1, n + 1))
rows = m.parse_rows(raw)
print(json.dumps({"n": len(rows), "msg": m.build_message(rows, internal, 7) if rows else ""}))
`;

function run(n: number): { n: number; msg: string } {
  const r = spawnSync('python3', ['-I', '-c', PY, SCRIPT, String(n)], { encoding: 'utf8' });
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout);
}

describe('x402-settle-leak-alerts digest (T-0675)', () => {
  it('0 rows: nothing to page', () => {
    const o = run(0);
    expect(o.n).toBe(0);
    expect(o.msg).toBe('');
  });

  it('1 row: original single-event format, not a digest', () => {
    const o = run(1);
    expect(o.msg).toContain('x402 settle FAILED (revenue leak)');
    expect(o.msg).toContain('outbox id: 1 @');
    expect(o.msg).not.toContain('BURST');
    expect(o.msg).not.toContain('top reasons');
  });

  it('164 rows: exactly one message with burst, totals, top reasons, success count', () => {
    const o = run(164);
    expect(o.n).toBe(164);
    expect(o.msg.split('\n')[0]).toContain('BURST');
    expect(o.msg.split('\n')[0]).toContain('x164');
    expect(o.msg).toContain('total: $0.2083');
    expect(o.msg).toContain(
      'top reasons: settle_returned_failure: invalid_exact_evm_transaction_failed x132; timeout x32',
    );
    expect(o.msg).toContain('first: 2026-11-02 12:01:00+00');
    expect(o.msg).toContain('internal test traffic: 54 of 164; real clients: 110');
    expect(o.msg).toContain('settle successes in the same window: 7');
  });

  it('a small batch is a digest without BURST', () => {
    const o = run(3);
    expect(o.msg).toContain('x3');
    expect(o.msg).not.toContain('BURST');
  });
});
