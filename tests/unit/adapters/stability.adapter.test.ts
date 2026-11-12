// T-0804: stability.generate through Comfy Router (fixtures only, no live call).
jest.mock('../../../src/config/provider-limits.json', () => ({
  stability: { limit_type: 'credits' },
}));
jest.mock('../../../src/services/redis.service', () => ({
  getSharedRedis: () => ({
    async del() {
      return 1;
    },
    async hmset() {
      return 'OK';
    },
    async expire() {
      return 1;
    },
    async setex() {
      return 'OK';
    },
  }),
}));
const logLines: string[] = [];
jest.mock('../../../src/config/logger', () => {
  const rec = (...a: unknown[]) => {
    logLines.push(JSON.stringify(a));
  };
  return { logger: { info: rec, warn: rec, error: rec, debug: rec } };
});

import { StabilityAdapter } from '../../../src/adapters/stability';
import type { ProviderRequest } from '../../../src/types/provider';

const KEY = 'test-key-' + 'x'.repeat(20);
const originalFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const req: ProviderRequest = {
  toolId: 'stability.generate',
  params: {
    prompt: 'a lighthouse',
    negative_prompt: 'blurry',
    aspect_ratio: '16:9',
    style_preset: 'photographic',
  },
  requestId: 'req_t',
};
// recorded shape from the Comfy docs example (generate-core Output)
const comfyBody = {
  finish_reason: 'SUCCESS',
  image: 'https://example.invalid/stability/image.png',
  seed: 12345,
};

describe('StabilityAdapter via Comfy Router', () => {
  it('posts JSON to the Comfy endpoint with X-API-Key and no Authorization', async () => {
    const png = Buffer.from('fakepngbytes');
    const f = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(comfyBody))
      .mockResolvedValueOnce(new Response(png, { status: 200 }));
    globalThis.fetch = f as unknown as typeof fetch;
    await new StabilityAdapter(KEY, 'comfy').call(req);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.comfy.org/v2/models/stability/generate-core');
    expect(init.method).toBe('POST');
    expect(init.headers['X-API-Key']).toBe(KEY);
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({
      prompt: 'a lighthouse',
      negative_prompt: 'blurry',
      aspect_ratio: '16:9',
      style_preset: 'photographic',
      output_format: 'png',
    });
  });

  it('maps the Comfy body (signed URL) to the legacy output fields', async () => {
    const png = Buffer.from('fakepngbytes');
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(comfyBody))
      .mockResolvedValueOnce(new Response(png, { status: 200 })) as unknown as typeof fetch;
    const raw = await new StabilityAdapter(KEY, 'comfy').call(req);
    const b = raw.body as Record<string, unknown>;
    const b64 = png.toString('base64');
    expect(b.image_data_uri).toBe(`data:image/png;base64,${b64}`);
    expect(b.image_base64_preview).toBe(b64.slice(0, 200) + '...');
    expect(b.image_size_bytes).toBe(Math.round(b64.length * 0.75));
    expect(b.seed).toBe(12345);
    expect(b.finish_reason).toBe('SUCCESS');
  });

  it('maps 402 insufficient_credits to provider_unavailable without leaking the key', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ error_type: 'insufficient_credits' }, 402),
      ) as unknown as typeof fetch;
    let err: any;
    try {
      await new StabilityAdapter(KEY, 'comfy').call(req);
    } catch (e) {
      err = e;
    }
    expect(err.code).toBe('provider_unavailable');
    expect(err.httpStatus).toBe(503);
    expect(JSON.stringify(err)).not.toContain(KEY);
    expect(logLines.join('\n')).not.toContain(KEY);
  });
});

describe('StabilityAdapter legacy path (fallback)', () => {
  it('posts to api.stability.ai with Bearer and maps base64 image', async () => {
    const f = jest
      .fn()
      .mockResolvedValue(jsonResponse({ image: 'QUJD', seed: 7, finish_reason: 'SUCCESS' }));
    globalThis.fetch = f as unknown as typeof fetch;
    const raw = await new StabilityAdapter(KEY).call(req);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.stability.ai/v2beta/stable-image/generate/core');
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect((raw.body as any).image_data_uri).toBe('data:image/png;base64,QUJD');
  });
});
