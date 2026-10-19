/**
 * T-0491: sessionless GET /mcp with Accept text/html redirects 302 to /connect; MCP clients
 * (text/event-stream) and requests without Accept keep the 400. Real router, no supertest
 * (not installed): a local http server and fetch with redirect: 'manual'.
 */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMcpRouter } from '../../src/mcp/server';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: jest.fn() }));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getActiveToolIds: () => new Set<string>(),
}));

describe('T-0491 GET /mcp browser redirect', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use(createMcpRouter());
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const get = (headers: Record<string, string>) =>
    fetch(`${base}/mcp`, { method: 'GET', headers, redirect: 'manual' });

  it('browser Accept without a session -> 302 /connect', async () => {
    const res = await get({ accept: 'text/html,application/xhtml+xml,*/*;q=0.8' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/connect');
  });

  it('Accept text/event-stream without a session -> 400 with the existing body', async () => {
    const res = await get({ accept: 'text/event-stream' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'bad_request',
      message: 'Missing mcp-session-id header',
    });
  });

  it('no Accept header -> 400 unchanged', async () => {
    const res = await get({});
    expect(res.status).toBe(400);
  });
});
