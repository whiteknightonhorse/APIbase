/**
 * T-0795: MCP session funnel (internal measurement). Pure functions plus one in-memory map, no I/O.
 * Counts requests by JSON-RPC method, and per session the furthest step reached
 * (initialize < tools_list < tools_call < payment_required < paid) with the payer class of the
 * first paid call. Labels come from fixed sets: no session id, tool id or address.
 */
import { isInternalWallet } from '../config/internal-wallets';
import { mcpRpcRequestsTotal, mcpSessionsEndedTotal } from '../services/metrics.service';

export type Surface = 'mcp' | 'storefront' | 'sse';
export type Method = 'initialize' | 'tools_list' | 'tools_call' | 'other';
export type Outcome = 'paid' | 'payment_required' | 'ok_unpaid' | 'error';
export type PayerClass = 'internal' | 'external' | 'none';
export type Step = 'initialize' | 'tools_list' | 'tools_call' | 'payment_required' | 'paid';

const STEPS: readonly Step[] = [
  'initialize',
  'tools_list',
  'tools_call',
  'payment_required',
  'paid',
];
const MAX_BATCH = 50;

const METHOD_MAP: Readonly<Record<string, Method>> = {
  initialize: 'initialize',
  'tools/list': 'tools_list',
  'tools/call': 'tools_call',
};

function methodOfMessage(msg: unknown): Method {
  if (typeof msg !== 'object' || msg === null) return 'other';
  const m = (msg as { method?: unknown }).method;
  if (typeof m !== 'string') return 'other';
  return Object.prototype.hasOwnProperty.call(METHOD_MAP, m) ? METHOD_MAP[m] : 'other';
}

/** JSON-RPC methods of a request body: one entry per message, a batch capped at 50; non-object -> []. */
export function methodsOf(body: unknown): Method[] {
  if (Array.isArray(body)) return body.slice(0, MAX_BATCH).map(methodOfMessage);
  if (typeof body === 'object' && body !== null) return [methodOfMessage(body)];
  return [];
}

export function payerClassOf(payer: unknown): PayerClass {
  if (typeof payer !== 'string' || payer === '') return 'none';
  return isInternalWallet(payer) ? 'internal' : 'external';
}

interface SessionState {
  surface: Surface;
  reached: number; // index into STEPS, -1 = none yet
  payer: PayerClass;
}

const funnel = new Map<string, SessionState>();

function reach(s: SessionState, step: Step): void {
  const i = STEPS.indexOf(step);
  if (i > s.reached) s.reached = i;
}

export function noteRequest(sid: string, surface: Surface, body: unknown): void {
  const methods = methodsOf(body);
  let s = funnel.get(sid);
  if (!s) {
    s = { surface, reached: -1, payer: 'none' };
    funnel.set(sid, s);
  }
  for (const m of methods) {
    mcpRpcRequestsTotal.inc({ surface, method: m });
    if (m !== 'other') reach(s, m);
  }
}

export function noteOutcome(sid: string, outcome: Outcome, payerClass: PayerClass): void {
  const s = funnel.get(sid);
  if (!s) return;
  if (outcome === 'paid') {
    // The payer class of the first paid call stays.
    if (STEPS[s.reached] !== 'paid') s.payer = payerClass;
    reach(s, 'paid');
  } else if (outcome === 'payment_required') {
    reach(s, 'payment_required');
  } else {
    reach(s, 'tools_call');
  }
}

function emit(s: SessionState): void {
  if (s.reached < 0) return;
  mcpSessionsEndedTotal.inc({ surface: s.surface, reached: STEPS[s.reached], payer: s.payer });
}

/** Counts the session once and forgets it; a second call for the same sid does nothing. */
export function endSession(sid: string): void {
  const s = funnel.get(sid);
  if (!s) return;
  funnel.delete(sid);
  emit(s);
}

export function endAllSessions(): void {
  for (const s of funnel.values()) emit(s);
  funnel.clear();
}
