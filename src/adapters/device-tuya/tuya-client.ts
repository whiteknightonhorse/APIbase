import { createHmac, randomUUID } from 'node:crypto';
import { logger } from '../../config/logger';

/**
 * ⛔ FROZEN, 2026-09-02 (Fable's final ruling on the device-vendor program).
 * Not deleted -- kept as the reference shape for the next vendor's client
 * (SmartThings is next, has a real web OAuth flow this codebase can reach).
 *
 * Why frozen: Tuya's account-linking OAuth ("Link Tuya App Account") turned
 * out to be reachable only through an OEM application Tuya sells as its own
 * product. Buying that product would not even get us what this file was
 * built for -- the end user would be authorizing OUR OEM app's own Tuya
 * account, not logging into their own Smart Life / Tuya Smart app the way
 * the connect-webview flow in device-connect.router.ts assumes. Tuya is no
 * longer the first vendor; see docs/OPERATOR-ACTION-device-vendor-tuya.md
 * (status: SUPERSEDED) and docs/OPERATOR-ACTION-device-vendor-smartthings.md.
 *
 * This module is NOT verified working. Two known defects sit in it,
 * unresolved, so the next person doesn't have to re-find them:
 *
 * (a) SIGNING IS WRONG. `signTokenOp`/`signServiceOp` below implement an
 *     outdated simple formula -- HMAC-SHA256(client_id + t) for token ops,
 *     HMAC-SHA256(client_id + access_token + t) for device ops. Tuya's
 *     current Cloud API scheme requires a `stringToSign` component (method
 *     + "\n" + SHA256(body) + "\n" + signed-headers + "\n" + URL-with-
 *     ALPHABETICALLY-SORTED-query-params) folded into the HMAC input. With
 *     the formula as it stands today, EVERY real call to Tuya fails
 *     signature verification -- including the very first authorization-code
 *     exchange. There is no live call anywhere in this codebase that would
 *     have caught this; it was only ever exercised against a mocked HTTP
 *     layer that mirrors the (wrong) formula back at itself. Full spec:
 *     https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g
 *
 * (b) REFRESH IS NOT SAFE UNDER CONCURRENCY. Tuya's `refresh_token` is
 *     single-use -- it is consumed the moment it is redeemed. Nothing in
 *     this file or in device-connection.service.ts serializes a refresh
 *     per connection. Two calls that both see an expired access token for
 *     the SAME connection at the same moment will both try to redeem the
 *     same refresh_token: one wins, the other's refresh fails, and the
 *     connection is now stuck with no valid refresh_token left to recover
 *     with -- a bricked connection, not a retryable error.
 *
 * Thaw predicate -- resume work here only when ONE of these becomes true:
 *   1. Tuya opens OAuth account-linking to non-OEM / plain web clients, or
 *   2. Tuya publishes a real API for generating the "Link Tuya App Account"
 *      QR code (today that binding is console-only, admin-driven, and has
 *      no API this codebase found), or
 *   3. the operator makes an informed, deliberate decision to buy the OEM
 *      application as a product, understanding it authorizes OUR app's own
 *      Tuya account rather than the end user's.
 * None of these is true as of this freeze.
 */

export interface TuyaConfig {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string; // e.g. https://openapi.tuyaus.com -- operator-set per their project's data center
}

export interface TuyaTokenResult {
  accessToken: string;
  refreshToken: string;
  expireTimeSec: number;
  uid: string;
}

export interface TuyaDeviceSummary {
  id: string;
  name: string;
  category: string;
  online: boolean;
}

export interface TuyaStatusPoint {
  code: string;
  value: unknown;
}

function nowMs(): string {
  return String(Date.now());
}

function signTokenOp(cfg: TuyaConfig, t: string): string {
  return createHmac('sha256', cfg.clientSecret)
    .update(cfg.clientId + t)
    .digest('hex')
    .toUpperCase();
}

function signServiceOp(cfg: TuyaConfig, accessToken: string, t: string): string {
  return createHmac('sha256', cfg.clientSecret)
    .update(cfg.clientId + accessToken + t)
    .digest('hex')
    .toUpperCase();
}

function tokenHeaders(cfg: TuyaConfig): Record<string, string> {
  const t = nowMs();
  return {
    client_id: cfg.clientId,
    sign: signTokenOp(cfg, t),
    sign_method: 'HMAC-SHA256',
    t,
  };
}

function serviceHeaders(cfg: TuyaConfig, accessToken: string): Record<string, string> {
  const t = nowMs();
  return {
    client_id: cfg.clientId,
    access_token: accessToken,
    sign: signServiceOp(cfg, accessToken, t),
    sign_method: 'HMAC-SHA256',
    t,
  };
}

async function tuyaGet<T>(
  cfg: TuyaConfig,
  path: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<T> {
  const res = await fetch(`${cfg.apiBaseUrl}${path}`, {
    method: 'GET',
    headers: { ...headers, lang: 'en' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await res.json()) as { success: boolean; result?: T; msg?: string; code?: number };
  if (!res.ok || !body.success) {
    throw new Error(
      `Tuya API error (HTTP ${res.status}): ${body.msg ?? 'unknown'} [code ${body.code ?? '?'}]`,
    );
  }
  return body.result as T;
}

async function tuyaPost<T>(
  cfg: TuyaConfig,
  path: string,
  headers: Record<string, string>,
  payload: unknown,
  timeoutMs: number,
): Promise<T> {
  const bodyStr = JSON.stringify(payload);
  const res = await fetch(`${cfg.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { ...headers, lang: 'en', 'Content-Type': 'application/json' },
    body: bodyStr,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await res.json()) as { success: boolean; result?: T; msg?: string; code?: number };
  if (!res.ok || !body.success) {
    throw new Error(
      `Tuya API error (HTTP ${res.status}): ${body.msg ?? 'unknown'} [code ${body.code ?? '?'}]`,
    );
  }
  return body.result as T;
}

/** Exchange an OAuth authorization code for tokens (grant_type=2, "Code Mode"). */
export async function exchangeCode(
  cfg: TuyaConfig,
  code: string,
  timeoutMs = 10_000,
): Promise<TuyaTokenResult> {
  const result = await tuyaGet<{
    access_token: string;
    refresh_token: string;
    expire_time: number;
    uid: string;
  }>(
    cfg,
    `/v1.0/token?grant_type=2&code=${encodeURIComponent(code)}`,
    tokenHeaders(cfg),
    timeoutMs,
  );
  logger.info({ vendor: 'tuya' }, 'device connect: authorization code exchanged for tokens');
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expireTimeSec: result.expire_time,
    uid: result.uid,
  };
}

/** Refresh an access token. Tuya rotates BOTH tokens on every refresh. */
export async function refreshAccessToken(
  cfg: TuyaConfig,
  refreshToken: string,
  timeoutMs = 10_000,
): Promise<TuyaTokenResult> {
  const result = await tuyaGet<{
    access_token: string;
    refresh_token: string;
    expire_time: number;
    uid: string;
  }>(cfg, `/v1.0/token/${encodeURIComponent(refreshToken)}`, tokenHeaders(cfg), timeoutMs);
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expireTimeSec: result.expire_time,
    uid: result.uid,
  };
}

export async function listUserDevices(
  cfg: TuyaConfig,
  uid: string,
  accessToken: string,
  timeoutMs = 10_000,
): Promise<TuyaDeviceSummary[]> {
  return tuyaGet<TuyaDeviceSummary[]>(
    cfg,
    `/v1.0/users/${encodeURIComponent(uid)}/devices`,
    serviceHeaders(cfg, accessToken),
    timeoutMs,
  );
}

export async function getDeviceStatus(
  cfg: TuyaConfig,
  deviceId: string,
  accessToken: string,
  timeoutMs = 10_000,
): Promise<TuyaStatusPoint[]> {
  return tuyaGet<TuyaStatusPoint[]>(
    cfg,
    `/v1.0/devices/${encodeURIComponent(deviceId)}/status`,
    serviceHeaders(cfg, accessToken),
    timeoutMs,
  );
}

export async function sendDeviceCommand(
  cfg: TuyaConfig,
  deviceId: string,
  command: string,
  value: unknown,
  accessToken: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const result = await tuyaPost<boolean>(
    cfg,
    `/v1.0/devices/${encodeURIComponent(deviceId)}/commands`,
    serviceHeaders(cfg, accessToken),
    { commands: [{ code: command, value }] },
    timeoutMs,
  );
  return result === true;
}

/** Exported purely for the signature self-test -- not used at runtime elsewhere. */
export const _internal = { signTokenOp, signServiceOp, randomNonce: () => randomUUID() };
