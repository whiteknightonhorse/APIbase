import { createHmac, randomUUID } from 'node:crypto';
import { logger } from '../../config/logger';

/**
 * Tuya OpenAPI client -- OAuth 2.0 account-linking ("Code Mode", grant_type=2)
 * + device state/command calls, per Tuya's publicly documented Cloud API
 * signature scheme (developer.tuya.com "Sign Requests" + "Get Token" +
 * "Refresh Token" docs, cross-checked against Tuya's own support article and
 * multiple open-source SDKs, 2026-09-02).
 *
 * ⚠️ DISCLOSED GAP, not glossed over: this has NOT been exercised against a
 * real Tuya cloud project. That requires a client_id/secret issued by Tuya's
 * IoT Development Platform, which requires the operator to register a
 * developer account -- see docs/OPERATOR-ACTION-device-vendor-tuya.md. Every
 * request/response shape below is taken from Tuya's own documentation and
 * verified self-consistent by this file's own tests (signature format,
 * header shape) -- it is NOT independently verified live. Do not treat the
 * request-count numbers in any report as calls that actually reached Tuya.
 *
 * Two distinct signature formulas (Tuya's own split):
 *   Token management (get/refresh token): sign = HMAC-SHA256(client_id + t, secret)
 *   Service management (device calls):    sign = HMAC-SHA256(client_id + access_token + t, secret)
 * Both upper-cased hex, both include `t` (13-digit ms epoch) as a request header too.
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
