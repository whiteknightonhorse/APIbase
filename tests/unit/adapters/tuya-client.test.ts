import { createHmac } from 'node:crypto';
import {
  exchangeCode,
  refreshAccessToken,
  listUserDevices,
  getDeviceStatus,
  sendDeviceCommand,
  _internal,
  type TuyaConfig,
} from '../../../src/adapters/device-tuya/tuya-client';

/**
 * ⚠️ These tests verify INTERNAL CONSISTENCY against Tuya's PUBLICLY
 * DOCUMENTED signature formula and request/response shapes (see
 * tuya-client.ts's top-of-file doc comment for sources) -- they do NOT hit
 * the real Tuya cloud (no client_id/secret exist for this project yet, see
 * docs/OPERATOR-ACTION-device-vendor-tuya.md). A live-network proof is a
 * disclosed gap, not a claimed one.
 */

const cfg: TuyaConfig = {
  clientId: 'test_client_id_123',
  clientSecret: 'test_client_secret_456',
  apiBaseUrl: 'https://openapi.example-tuya-mock.com',
};

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('Tuya signature formulas (per developer.tuya.com "Sign Requests")', () => {
  it('token-management sign = HMAC-SHA256(client_id + t, secret).toUpperCase()', () => {
    const t = '1700000000000';
    const expected = createHmac('sha256', cfg.clientSecret)
      .update(cfg.clientId + t)
      .digest('hex')
      .toUpperCase();
    expect(_internal.signTokenOp(cfg, t)).toBe(expected);
  });

  it('service-management sign = HMAC-SHA256(client_id + access_token + t, secret).toUpperCase()', () => {
    const t = '1700000000000';
    const accessToken = 'fake-access-token';
    const expected = createHmac('sha256', cfg.clientSecret)
      .update(cfg.clientId + accessToken + t)
      .digest('hex')
      .toUpperCase();
    expect(_internal.signServiceOp(cfg, accessToken, t)).toBe(expected);
  });

  it('signatures are always uppercase 64-char hex', () => {
    const sig = _internal.signTokenOp(cfg, '1700000000000');
    expect(sig).toMatch(/^[0-9A-F]{64}$/);
  });

  it('a different secret produces a different signature (sanity check it is actually keyed)', () => {
    const a = _internal.signTokenOp(cfg, '1700000000000');
    const b = _internal.signTokenOp({ ...cfg, clientSecret: 'different_secret' }, '1700000000000');
    expect(a).not.toBe(b);
  });
});

describe("Tuya client request shapes (mocked HTTP, per Tuya's documented API)", () => {
  it('exchangeCode calls GET /v1.0/token?grant_type=2&code=... with client_id/sign/sign_method/t headers', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = jest.fn().mockImplementation((url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve(
        mockJsonResponse({
          success: true,
          result: { access_token: 'AT1', refresh_token: 'RT1', expire_time: 7200, uid: 'uid-1' },
        }),
      );
    });

    const result = await exchangeCode(cfg, 'auth-code-abc');

    expect(capturedUrl).toBe(`${cfg.apiBaseUrl}/v1.0/token?grant_type=2&code=auth-code-abc`);
    expect(capturedHeaders.client_id).toBe(cfg.clientId);
    expect(capturedHeaders.sign_method).toBe('HMAC-SHA256');
    expect(capturedHeaders.sign).toMatch(/^[0-9A-F]{64}$/);
    expect(capturedHeaders.access_token).toBeUndefined(); // token-mgmt op, no access_token header
    expect(result).toEqual({
      accessToken: 'AT1',
      refreshToken: 'RT1',
      expireTimeSec: 7200,
      uid: 'uid-1',
    });
  });

  it('refreshAccessToken calls GET /v1.0/token/{refresh_token}', async () => {
    let capturedUrl = '';
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        mockJsonResponse({
          success: true,
          result: { access_token: 'AT2', refresh_token: 'RT2', expire_time: 7200, uid: 'uid-1' },
        }),
      );
    });

    const result = await refreshAccessToken(cfg, 'old-refresh-token');
    expect(capturedUrl).toBe(`${cfg.apiBaseUrl}/v1.0/token/old-refresh-token`);
    expect(result.accessToken).toBe('AT2');
    expect(result.refreshToken).toBe('RT2'); // rotated, not reused
  });

  it('listUserDevices includes access_token header (service-management op)', async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve(
        mockJsonResponse({
          success: true,
          result: [{ id: 'd1', name: 'AC', category: 'kt', online: true }],
        }),
      );
    });

    const devices = await listUserDevices(cfg, 'uid-1', 'AT1');
    expect(capturedHeaders.access_token).toBe('AT1');
    expect(devices).toHaveLength(1);
    expect(devices[0].category).toBe('kt');
  });

  it('getDeviceStatus returns the flat status-point array', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        mockJsonResponse({ success: true, result: [{ code: 'switch_1', value: true }] }),
      );
    const status = await getDeviceStatus(cfg, 'd1', 'AT1');
    expect(status).toEqual([{ code: 'switch_1', value: true }]);
  });

  it('sendDeviceCommand POSTs {commands:[{code,value}]} and returns success boolean', async () => {
    let capturedBody = '';
    let capturedMethod = '';
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedMethod = init.method as string;
      capturedBody = init.body as string;
      return Promise.resolve(mockJsonResponse({ success: true, result: true }));
    });

    const ok = await sendDeviceCommand(cfg, 'd1', 'temp_set', 22, 'AT1');
    expect(capturedMethod).toBe('POST');
    expect(JSON.parse(capturedBody)).toEqual({ commands: [{ code: 'temp_set', value: 22 }] });
    expect(ok).toBe(true);
  });

  it('throws on success:false (Tuya-side rejection)', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(mockJsonResponse({ success: false, msg: 'invalid code', code: 1010 }));
    await expect(exchangeCode(cfg, 'bad-code')).rejects.toThrow(/invalid code/);
  });
});
