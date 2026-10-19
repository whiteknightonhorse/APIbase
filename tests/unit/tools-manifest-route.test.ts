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
import { MANIFEST_SHA256 } from '../../src/mcp/tool-fingerprint';

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
beforeEach(() => (getToolById as jest.Mock).mockReset());

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
    expect(body.manifest_sha256).toBe(MANIFEST_SHA256);
    expect(typeof body.algorithm).toBe('string');
    expect(body.total).toBe(body.tools.length);
    expect(body.tools[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      definition_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('etag')).toBe(`"${MANIFEST_SHA256}"`);
  });

  it('304 with an empty body on a matching If-None-Match', async () => {
    const res = await get({ 'If-None-Match': `"${MANIFEST_SHA256}"` });
    expect(res.status).toBe(304);
    expect(res.text).toBe('');
  });

  it('is not handled by the :toolId route', async () => {
    await get();
    expect(getToolById).not.toHaveBeenCalled();
  });
});
