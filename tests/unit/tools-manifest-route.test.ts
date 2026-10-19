/**
 * T-0500: GET /api/v1/tools/manifest — pure in-memory, ETag + 304, and never handled by /:toolId.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import http, { type Server } from 'node:http';

jest.mock('../../src/services/tool-registry.service', () => ({
  getPublicCatalog: jest.fn(),
  getToolsPaginated: jest.fn(),
  getToolById: jest.fn(),
}));
jest.mock('../../src/services/discovery.service', () => ({
  discover: jest.fn(),
}));

import { toolsRouter } from '../../src/routes/tools.router';
import { getToolById } from '../../src/services/tool-registry.service';
import { AppError, ErrorCode } from '../../src/types/errors';
import { getManifestSha256 } from '../../src/mcp/tool-fingerprint';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { getShopToolDefinitions } from '../../src/shop/tool-fingerprint';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
let mockActive = new Set<string>();
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getActiveToolIds: () => mockActive,
}));

const app = express();
app.use(toolsRouter);

let server: Server;
let base: string;
beforeAll(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});
beforeEach(() => {
  (getToolById as jest.Mock).mockReset();
  mockActive = new Set<string>();
});

// node:http, not fetch: undici adds `Cache-Control: no-cache` to any request carrying
// If-None-Match, which makes Express report req.fresh === false.
const get = (headers: Record<string, string> = {}) =>
  new Promise<{ status: number; headers: Map<string, string>; text: string }>((resolve, reject) => {
    http
      .get(`${base}/api/v1/tools/manifest`, { headers }, (r) => {
        let text = '';
        r.setEncoding('utf8');
        r.on('data', (c) => (text += c));
        r.on('end', () =>
          resolve({
            status: r.statusCode as number,
            headers: new Map(Object.entries(r.headers).map(([k, v]) => [k, String(v)])),
            text,
          }),
        );
      })
      .on('error', reject);
  });

describe('GET /api/v1/tools/manifest', () => {
  it('200 with the manifest shape and cache headers', async () => {
    const res = await get();
    const body = JSON.parse(res.text);
    expect(res.status).toBe(200);
    expect(body.manifest_sha256).toBe(getManifestSha256());
    expect(typeof body.algorithm).toBe('string');
    expect(body.total).toBe(body.tools.length);
    expect(body.tools[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      definition_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('etag')).toBe(`"${getManifestSha256()}"`);
  });

  it('ETag equals the quoted manifest_sha256 of the body and moves with the served set', async () => {
    const first = await get();
    const body = JSON.parse(first.text);
    expect(first.headers.get('etag')).toBe(`"${body.manifest_sha256}"`);
    mockActive = new Set(TOOL_DEFINITIONS.filter((_, i) => i % 2 === 0).map((d) => d.toolId));
    const second = await get();
    expect(second.headers.get('etag')).not.toBe(first.headers.get('etag'));
    const body2 = JSON.parse(second.text);
    expect(body2.total).toBe(body2.tools.length);
    expect(body2.total).toBeLessThan(body.total);
  });

  it('lists a shop id', async () => {
    const body = JSON.parse((await get()).text);
    const ids = body.tools.map((t: { id: string }) => t.id);
    expect(ids).toContain('shop.merchant.register');
    expect(getShopToolDefinitions().has('shop.merchant.register')).toBe(true);
  });

  it('304 with an empty body on a matching If-None-Match', async () => {
    const res = await get({ 'If-None-Match': `"${getManifestSha256()}"` });
    expect(res.status).toBe(304);
    expect(res.text).toBe('');
  });

  it('is not handled by the :toolId route', async () => {
    await get();
    expect(getToolById).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/tools/shop.<name> (T-0502)', () => {
  const getJson = (path: string) =>
    new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      http
        .get(`${base}${path}`, (r) => {
          let text = '';
          r.setEncoding('utf8');
          r.on('data', (c) => (text += c));
          r.on('end', () => resolve({ status: r.statusCode as number, body: JSON.parse(text) }));
        })
        .on('error', reject);
    });

  it('returns exactly the five hashed fields, equal to the manifest entry, without the DB', async () => {
    const res = await getJson('/api/v1/tools/shop.merchant.register');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'definition_sha256',
      'description',
      'id',
      'input_schema',
      'name',
    ]);
    const manifest = JSON.parse((await get()).text);
    const entry = manifest.tools.find((t: { id: string }) => t.id === 'shop.merchant.register');
    expect(res.body.definition_sha256).toBe(entry.definition_sha256);
    expect(getToolById).not.toHaveBeenCalled();
  });

  it('an unknown shop id falls through to the DB lookup and 404s', async () => {
    (getToolById as jest.Mock).mockResolvedValue(null);
    const app404 = express();
    app404.use(toolsRouter);
    app404.use((err: unknown, _req: express.Request, res: express.Response, _n: unknown) => {
      res.status(err instanceof AppError && err.code === ErrorCode.NOT_FOUND ? 404 : 500).json({});
    });
    const srv = app404.listen(0);
    try {
      const port = (srv.address() as AddressInfo).port;
      const status = await new Promise<number>((resolve, reject) =>
        http
          .get(`http://127.0.0.1:${port}/api/v1/tools/shop.does.not.exist`, (r) => {
            r.resume();
            resolve(r.statusCode as number);
          })
          .on('error', reject),
      );
      expect(status).toBe(404);
      expect(getToolById).toHaveBeenCalledWith('shop.does.not.exist');
    } finally {
      srv.close();
    }
  });
});
