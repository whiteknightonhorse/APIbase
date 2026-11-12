/**
 * T-0795: MCP session funnel counters (internal measurement). Real prom-client counters, read back
 * through register.getSingleMetric.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  endAllSessions,
  endSession,
  methodsOf,
  noteOutcome,
  noteRequest,
  payerClassOf,
} from '../../src/mcp/session-funnel';
import { register } from '../../src/services/metrics.service';

type Labels = Record<string, string>;

async function value(name: string, labels: Labels): Promise<number> {
  const metric = register.getSingleMetric(name) as unknown as {
    get: () => Promise<{ values: { value: number; labels: Labels }[] }>;
  };
  const { values } = await metric.get();
  return values
    .filter((v) => Object.entries(labels).every(([k, x]) => v.labels[k] === x))
    .reduce((a, v) => a + v.value, 0);
}

const ended = (reached: string, payer: string, surface = 'mcp') =>
  value('mcp_sessions_ended_total', { surface, reached, payer });

const INTERNAL = (
  JSON.parse(
    readFileSync(resolve(__dirname, '../../config/autopilot/internal-wallets.json'), 'utf-8'),
  ) as { address: string }[]
)[0].address;
const EXTERNAL = '0x' + 'ab'.repeat(20);

const init = { jsonrpc: '2.0', id: 1, method: 'initialize' };
const list = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
const call = { jsonrpc: '2.0', id: 3, method: 'tools/call' };

let n = 0;
const sid = () => `s-${++n}`;

describe('methodsOf', () => {
  it('maps a single request', () => {
    expect(methodsOf(init)).toEqual(['initialize']);
    expect(methodsOf(list)).toEqual(['tools_list']);
    expect(methodsOf(call)).toEqual(['tools_call']);
    expect(methodsOf({ method: 'notifications/initialized' })).toEqual(['other']);
  });
  it('gives one entry per batch element', () => {
    expect(methodsOf([init, list, { method: 'ping' }])).toEqual([
      'initialize',
      'tools_list',
      'other',
    ]);
  });
  it('treats a non-string method as other', () => {
    expect(methodsOf({ method: 42 })).toEqual(['other']);
    expect(methodsOf({ method: ['tools/call'] })).toEqual(['other']);
    expect(methodsOf({ method: '__proto__' })).toEqual(['other']);
  });
  it('gives [] for a non-object body', () => {
    expect(methodsOf(undefined)).toEqual([]);
    expect(methodsOf(null)).toEqual([]);
    expect(methodsOf('tools/call')).toEqual([]);
    expect(methodsOf(7)).toEqual([]);
  });
  it('caps a batch at 50', () => {
    expect(methodsOf(Array.from({ length: 80 }, () => call))).toHaveLength(50);
  });
});

describe('payerClassOf', () => {
  it('classifies internal / external / none', () => {
    expect(payerClassOf(INTERNAL)).toBe('internal');
    expect(payerClassOf(INTERNAL.toUpperCase().replace('0X', '0x'))).toBe('internal');
    expect(payerClassOf(EXTERNAL)).toBe('external');
    expect(payerClassOf(null)).toBe('none');
    expect(payerClassOf('')).toBe('none');
    expect(payerClassOf(['x'])).toBe('none');
  });
});

describe('session funnel', () => {
  it('counts requests by method', async () => {
    const before = await value('mcp_rpc_requests_total', { surface: 'sse', method: 'tools_list' });
    const s = sid();
    noteRequest(s, 'sse', [list, list]);
    expect(await value('mcp_rpc_requests_total', { surface: 'sse', method: 'tools_list' })).toBe(
      before + 2,
    );
    endSession(s);
  });

  it('never goes backwards', async () => {
    const before = await ended('tools_call', 'none');
    const s = sid();
    noteRequest(s, 'mcp', call);
    noteRequest(s, 'mcp', init);
    noteRequest(s, 'mcp', list);
    endSession(s);
    expect(await ended('tools_call', 'none')).toBe(before + 1);
  });

  it('payment_required then paid ends as paid, with the payer class of the paid call', async () => {
    const b = await ended('paid', 'external');
    const s = sid();
    noteRequest(s, 'mcp', init);
    noteOutcome(s, 'payment_required', 'none');
    noteOutcome(s, 'paid', payerClassOf(EXTERNAL));
    noteOutcome(s, 'payment_required', 'none');
    endSession(s);
    expect(await ended('paid', 'external')).toBe(b + 1);
  });

  it('keeps the payer class of the first paid call', async () => {
    const b = await ended('paid', 'internal');
    const s = sid();
    noteRequest(s, 'mcp', call);
    noteOutcome(s, 'paid', payerClassOf(INTERNAL));
    noteOutcome(s, 'paid', payerClassOf(EXTERNAL));
    endSession(s);
    expect(await ended('paid', 'internal')).toBe(b + 1);
  });

  it('a session that stops at the 402 ends as payment_required / none', async () => {
    const b = await ended('payment_required', 'none', 'storefront');
    const s = sid();
    noteRequest(s, 'storefront', call);
    noteOutcome(s, 'payment_required', 'none');
    endSession(s);
    expect(await ended('payment_required', 'none', 'storefront')).toBe(b + 1);
  });

  it('endSession twice counts once', async () => {
    const b = await ended('initialize', 'none');
    const s = sid();
    noteRequest(s, 'mcp', init);
    endSession(s);
    endSession(s);
    expect(await ended('initialize', 'none')).toBe(b + 1);
  });

  it('endAllSessions counts every open session', async () => {
    const b = await ended('tools_list', 'none');
    noteRequest(sid(), 'mcp', list);
    noteRequest(sid(), 'mcp', list);
    noteRequest(sid(), 'mcp', list);
    endAllSessions();
    expect(await ended('tools_list', 'none')).toBe(b + 3);
    endAllSessions();
    expect(await ended('tools_list', 'none')).toBe(b + 3);
  });
});
