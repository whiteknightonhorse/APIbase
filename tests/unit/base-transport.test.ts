/** T-0642: Base RPC fallback transport. Local HTTP servers only: no network, no spend. */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const mockWarn = jest.fn();
const mockInfo = jest.fn();
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: (...a: unknown[]) => mockWarn(...a), info: mockInfo },
}));

import { createPublicClient } from 'viem';
import { baseTransport, resetBaseTransportLogThrottle } from '../../src/payments/base-transport';
import { x402RpcFallbackUsedTotal } from '../../src/services/metrics.service';

type Mode = 'ok' | 'drop' | 'err500';
function server(mode: Mode): Promise<{ url: string; srv: http.Server; hits: () => number }> {
  let n = 0;
  const srv = http.createServer((req, res) => {
    n++;
    req.resume();
    if (mode === 'drop') return void req.socket.destroy();
    if (mode === 'err500') {
      res.statusCode = 500;
      return void res.end('boom');
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x2105' }));
  });
  return new Promise((resolve) =>
    srv.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/SECRETKEY123`,
        srv,
        hits: () => n,
      }),
    ),
  );
}

async function counter(): Promise<number> {
  const m = await x402RpcFallbackUsedTotal.get();
  return m.values.reduce((a, v) => a + v.value, 0);
}

const servers: http.Server[] = [];
async function start(mode: Mode) {
  const s = await server(mode);
  servers.push(s.srv);
  return s;
}

beforeEach(() => {
  x402RpcFallbackUsedTotal.reset();
  mockWarn.mockClear();
  mockInfo.mockClear();
  resetBaseTransportLogThrottle();
});
afterAll(() => servers.forEach((s) => s.close()));

describe('baseTransport', () => {
  it('primary failing -> request served by the fallback, counter 1, log without key', async () => {
    const p = await start('drop');
    const f = await start('ok');
    const c = createPublicClient({ transport: baseTransport({ baseRpcUrls: [p.url, f.url] }) });
    expect(await c.getChainId()).toBe(8453);
    expect(f.hits()).toBe(1);
    expect(await counter()).toBe(1);
    const logged = JSON.stringify([...mockWarn.mock.calls, ...mockInfo.mock.calls]);
    expect(logged).toContain('fallback 127.0.0.1:');
    expect(logged).not.toContain('SECRETKEY123');
  });

  it('primary healthy -> fallback untouched, counter 0', async () => {
    const p = await start('ok');
    const f = await start('ok');
    const c = createPublicClient({ transport: baseTransport({ baseRpcUrls: [p.url, f.url] }) });
    await c.getChainId();
    expect(f.hits()).toBe(0);
    expect(await counter()).toBe(0);
  });

  it('both fail -> the call rejects as before, counter 0', async () => {
    const p = await start('err500');
    const f = await start('drop');
    const c = createPublicClient({ transport: baseTransport({ baseRpcUrls: [p.url, f.url] }) });
    await expect(c.getChainId()).rejects.toBeDefined();
    expect(await counter()).toBe(0);
  });

  it('no fallback configured -> single transport, counter 0', async () => {
    const p = await start('ok');
    const c = createPublicClient({ transport: baseTransport({ baseRpcUrls: [p.url] }) });
    expect(await c.getChainId()).toBe(8453);
    expect(await counter()).toBe(0);
  });

  it('fallback log line is throttled to once per minute', async () => {
    const p = await start('drop');
    const f = await start('ok');
    const c = createPublicClient({ transport: baseTransport({ baseRpcUrls: [p.url, f.url] }) });
    await c.getChainId();
    await c.getChainId();
    expect(await counter()).toBe(2);
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });
});
