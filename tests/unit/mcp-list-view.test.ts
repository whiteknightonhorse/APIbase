/**
 * T-0837: tools/list views fixed at initialize (/mcp?tools=lean|shop|all, same on GET /sse).
 * Real router over a local http server (supertest is not installed), runPipeline mocked.
 */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const mockRun = jest.fn();
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: (c: unknown) => mockRun(c) }));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getActiveToolIds: () => new Set<string>(),
}));
// Counts the zod 3 mirror renderings (withZod3ToolSchemas calls zod-to-json-schema per schema).
const mockRendered = jest.fn();
jest.mock('zod-to-json-schema', () => {
  const actual = jest.requireActual('zod-to-json-schema');
  return {
    ...actual,
    zodToJsonSchema: (...a: unknown[]) => {
      mockRendered();
      return actual.zodToJsonSchema(...a);
    },
  };
});

import { createMcpRouter, createMcpServer } from '../../src/mcp/server';
import {
  DEFAULT_LIST_VIEW,
  LEAN_TOOL_IDS,
  LEAN_TOOL_NAMES,
  withListView,
} from '../../src/mcp/list-view';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { toolSchemas } from '../../src/schemas/index';
import { register } from '../../src/services/metrics.service';

type Tool = { name: string };
type ListResult = { tools: Tool[]; nextCursor?: string; ttlMs?: number; cacheScope?: string };

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 't', version: '1' },
  },
};
const LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
const H = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'x-request-id': 'req-t0837',
};

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(createMcpRouter());
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function parse(text: string): Record<string, unknown> | null {
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  return line ? JSON.parse(line.slice(6)) : text ? JSON.parse(text) : null;
}

async function rpc(path: string, body: unknown, sid?: string) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { ...H, ...(sid ? { 'mcp-session-id': sid } : {}) },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { r, text, bytes: Buffer.byteLength(text), json: parse(text) };
}

/** initialize + initialized + tools/list on `path`; bytes = both response bodies. */
async function session(path: string) {
  const init = await rpc(path, INIT);
  const sid = init.r.headers.get('mcp-session-id') as string;
  await rpc(path, { jsonrpc: '2.0', method: 'notifications/initialized' }, sid);
  const list = await rpc(path, LIST, sid);
  return {
    sid,
    bytes: init.bytes + list.bytes,
    listText: list.text,
    result: (list.json as { result: ListResult }).result,
  };
}

const names = (r: ListResult) => r.tools.map((t) => t.name);

async function counter(view: string): Promise<number> {
  const m = register.getSingleMetric('mcp_sessions_by_view_total') as unknown as {
    get: () => Promise<{ values: { value: number; labels: Record<string, string> }[] }>;
  };
  return (await m.get()).values
    .filter((v) => v.labels.view === view)
    .reduce((a, v) => a + v.value, 0);
}

describe('tools/list views (T-0837)', () => {
  it('the default view is all', () => {
    expect(DEFAULT_LIST_VIEW).toBe('all');
  });

  it('lean lists exactly the exported set that is registered, under 20 KB with initialize', async () => {
    const s = await session('/mcp?tools=lean');
    const registered = LEAN_TOOL_IDS.map(
      (id) => TOOL_DEFINITIONS.find((d) => d.toolId === id)?.mcpName,
    ).filter((n): n is string => typeof n === 'string');
    expect(registered).toEqual(
      expect.arrayContaining([
        'apibase.discovery.search',
        'apibase.discovery.categories',
        'apibase.discovery.describe',
      ]),
    );
    expect(new Set(names(s.result))).toEqual(new Set(registered));
    expect(names(s.result).every((n) => LEAN_TOOL_NAMES.has(n))).toBe(true);
    expect(s.result.nextCursor).toBeUndefined();
    expect(s.result.ttlMs).toBe(300000);
    expect(s.result.cacheScope).toBe('public');
    process.stdout.write(`T-0837 lean initialize+tools/list bytes: ${s.bytes}\n`);
    expect(s.bytes).toBeLessThan(20 * 1024);
  });

  it('shop lists the lean set plus every registered shop.* tool', async () => {
    const all = await session('/mcp');
    const shop = await session('/mcp?tools=shop');
    const lean = await session('/mcp?tools=lean');
    const shopNames = names(all.result).filter((n) => n.startsWith('shop.'));
    expect(shopNames.length).toBeGreaterThan(0);
    expect(new Set(names(shop.result))).toEqual(new Set([...names(lean.result), ...shopNames]));
    expect(shop.result.nextCursor).toBeUndefined();
  });

  it('all is byte-identical to the list without the parameter, and the handler is not wrapped', async () => {
    const plain = await session('/mcp');
    const all = await session('/mcp?tools=all');
    expect(all.listText).toBe(plain.listText);
    expect(plain.result.tools.length).toBeGreaterThan(1000);

    const srv = createMcpServer('', 'req', {} as never);
    const handlers = (srv.server as unknown as { _requestHandlers: Map<string, unknown> })
      ._requestHandlers;
    const before = handlers.get('tools/list');
    expect(withListView(srv, 'all')).toBe(srv);
    expect(handlers.get('tools/list')).toBe(before);
  });

  it('the schema mirror runs only for listed tools; every tool stays registered', async () => {
    const srv = createMcpServer('', 'req', {} as never, undefined, undefined, 'lean');
    const registered = (srv as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: 't', version: '1' });
    await Promise.all([srv.connect(a), c.connect(b)]);
    mockRendered.mockClear();
    const r = (await c.listTools()) as ListResult;
    // T-0838: apibase.call is registered now, so the whole lean set is listed.
    expect(r.tools.length).toBe(LEAN_TOOL_IDS.length);
    // At most an input and an output schema per listed tool, never one per registered tool.
    expect(mockRendered.mock.calls.length).toBeLessThanOrEqual(2 * r.tools.length);
    // The full map is restored after the listing.
    expect((srv as unknown as { _registeredTools: Record<string, unknown> })._registeredTools).toBe(
      registered,
    );
    expect(Object.keys(registered).length).toBeGreaterThan(1000);
  });

  it('a tool absent from the lean list is callable by name and reaches the same handler', async () => {
    const target = TOOL_DEFINITIONS.find(
      (d) =>
        !d.toolId.startsWith('apibase.') &&
        d.mcpName &&
        toolSchemas[d.toolId]?.safeParse({}).success,
    )!;
    mockRun.mockReset();
    mockRun.mockImplementation(async (ctx: { toolId: string; params: unknown }) => ({
      ok: false,
      error: { code: 503, error: 'tool_unavailable', message: `stub ${ctx.toolId}` },
    }));
    const call = {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: target.mcpName, arguments: {} },
    };

    const lean = await session('/mcp?tools=lean');
    expect(names(lean.result)).not.toContain(target.mcpName);
    const viaLean = await rpc('/mcp?tools=lean', call, lean.sid);
    const all = await session('/mcp');
    const viaAll = await rpc('/mcp', call, all.sid);

    expect(mockRun).toHaveBeenCalledTimes(2);
    const [c1, c2] = mockRun.mock.calls.map((c) => c[0] as { toolId: string; params: unknown });
    expect(c1.toolId).toBe(target.toolId);
    expect(c2.toolId).toBe(target.toolId);
    expect(c1.params).toEqual(c2.params);
    expect(viaLean.json).toEqual(viaAll.json);
    expect(JSON.stringify(viaLean.json)).toContain(`stub ${target.toolId}`);
  });

  it('a legacy toolId alias also dispatches in a lean session', async () => {
    const target = TOOL_DEFINITIONS.find(
      (d) =>
        !d.toolId.startsWith('apibase.') &&
        d.mcpName &&
        d.mcpName !== d.toolId &&
        toolSchemas[d.toolId]?.safeParse({}).success,
    )!;
    mockRun.mockReset();
    mockRun.mockResolvedValue({ ok: false, error: { code: 503, error: 'x', message: 'x' } });
    const lean = await session('/mcp?tools=lean');
    await rpc(
      '/mcp?tools=lean',
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: target.toolId, arguments: {} },
      },
      lean.sid,
    );
    expect((mockRun.mock.calls[0][0] as { toolId: string }).toolId).toBe(target.toolId);
  });

  it.each([
    ['/mcp?tools=bogus'],
    ['/mcp?tools=LEAN'],
    ['/mcp?tools='],
    ['/mcp?tools=lean&tools=all'],
    ['/mcp?tools[a]=lean'],
  ])('%s -> JSON-RPC -32602 naming the three values, no session', async (path) => {
    const res = await rpc(path, INIT);
    expect(res.r.status).toBe(400);
    expect(res.r.headers.get('mcp-session-id')).toBeNull();
    const body = res.json as { error: { code: number; message: string }; id: unknown };
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain('lean, shop, all');
    expect(body.id).toBe(1);
  });

  it('counts each session start once under its view', async () => {
    const lean0 = await counter('lean');
    const all0 = await counter('all');
    await session('/mcp?tools=lean');
    await session('/mcp');
    expect(await counter('lean')).toBe(lean0 + 1);
    expect(await counter('all')).toBe(all0 + 1);
  });

  it('the T-0796 counters keep their label sets', () => {
    const labels = (name: string) =>
      (register.getSingleMetric(name) as unknown as { labelNames: string[] }).labelNames;
    expect(labels('mcp_rpc_requests_total')).toEqual(['surface', 'method']);
    expect(labels('mcp_sessions_ended_total')).toEqual(['surface', 'reached', 'payer']);
    expect(labels('mcp_tool_call_outcomes_total')).toEqual(['outcome', 'payer']);
  });
});

describe('SSE honours the view (T-0837)', () => {
  async function sseList(path: string): Promise<ListResult> {
    const ctl = new AbortController();
    const stream = await fetch(base + path, {
      headers: { authorization: 'Bearer test-key', accept: 'text/event-stream' },
      signal: ctl.signal,
    });
    const reader = stream.body!.getReader();
    let buf = '';
    const until = async (needle: string) => {
      while (!buf.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended, got: ' + buf);
        buf += new TextDecoder().decode(value);
      }
    };
    await until('sessionId=');
    const endpoint = /data: (\/messages\?sessionId=[^\s]+)/.exec(buf)![1];
    const send = (body: unknown) =>
      fetch(base + endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    await send(INIT);
    await until('"id":1');
    await send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    await send(LIST);
    await until('"id":2');
    // The list message can be large: read until its SSE event ends.
    const start =
      buf.indexOf('{"result":{"tools"') >= 0
        ? buf.indexOf('{"result":{"tools"')
        : buf.lastIndexOf('data: {') + 6;
    while (!buf.slice(start).includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += new TextDecoder().decode(value);
    }
    ctl.abort();
    const line = buf
      .split('\n')
      .filter((l) => l.startsWith('data: {'))
      .map((l) => JSON.parse(l.slice(6)) as { id?: number; result?: ListResult })
      .find((m) => m.id === 2);
    return line!.result!;
  }

  it('/sse?tools=lean lists the lean set', async () => {
    const r = await sseList('/sse?tools=lean');
    expect(names(r).every((n) => LEAN_TOOL_NAMES.has(n))).toBe(true);
    expect(names(r)).toContain('apibase.discovery.describe');
  });

  it('/sse without the parameter lists everything', async () => {
    const r = await sseList('/sse');
    expect(r.tools.length).toBeGreaterThan(1000);
  });

  it('/sse?tools=bogus -> 400 with JSON-RPC -32602', async () => {
    const r = await fetch(base + '/sse?tools=bogus', {
      headers: { authorization: 'Bearer test-key', accept: 'text/event-stream' },
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain('lean, shop, all');
  });
});
