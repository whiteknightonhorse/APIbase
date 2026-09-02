import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
} from '../../types/provider';
import {
  getOwnedConnection,
  listActiveConnections,
  rotateTokens,
} from '../../services/device-connection.service';
import { enforceDeviceSafety, DeviceSafetyViolation } from '../../services/device-safety.service';
import {
  exchangeCode as tuyaExchangeCode,
  refreshAccessToken as tuyaRefreshToken,
  listUserDevices as tuyaListDevices,
  getDeviceStatus as tuyaGetStatus,
  sendDeviceCommand as tuyaSendCommand,
  type TuyaConfig,
} from './tuya-client';
import { config } from '../../config';
import { logger } from '../../config/logger';

// Re-exported so the connect-webview router can use the same OAuth code
// exchange this adapter uses for refresh, without importing the vendor
// client directly (one seam, not two ways to talk to Tuya).
export { tuyaExchangeCode };

/** Best-effort Tuya device-category -> our device-classes.json class name.
 *  Only the T1 classes actually reachable through Tuya this cycle are
 *  mapped; an unmapped category returns undefined and the safety layer's
 *  bounds/confirm checks simply don't fire for it (disclosed gap, see
 *  docs/09-device-mcp-layer.md) -- it does NOT block the call, since a
 *  missing mapping is a coverage gap, not a security decision either way. */
const TUYA_CATEGORY_TO_CLASS: Record<string, string> = {
  kt: 'thermostat_ac',
  cz: 'smart_plug',
  pc: 'smart_power_strip',
  dj: 'dimmable_light',
  xdd: 'dimmable_light',
  dc: 'color_light',
  kg: 'smart_switch',
  wsdcg: 'temp_humidity_sensor',
  cl: 'smart_blinds_curtains',
  fs: 'smart_fan',
};

function tuyaConfig(): TuyaConfig | undefined {
  const clientId = config.TUYA_CLIENT_ID;
  const clientSecret = config.TUYA_CLIENT_SECRET;
  const apiBaseUrl = config.TUYA_API_BASE_URL;
  if (!clientId || !clientSecret || !apiBaseUrl) return undefined;
  return { clientId, clientSecret, apiBaseUrl };
}

function deviceError(
  code: (typeof ProviderErrorCode)[keyof typeof ProviderErrorCode],
  httpStatus: number,
  message: string,
  toolId: string,
  durationMs: number,
): ProviderError {
  return { code, httpStatus, message, provider: 'device', toolId, durationMs };
}

function okResponse(body: unknown, start: number): ProviderRawResponse {
  const json = JSON.stringify(body);
  return {
    status: 200,
    headers: {},
    body,
    durationMs: Math.round(performance.now() - start),
    byteLength: Buffer.byteLength(json, 'utf8'),
  };
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5min before expiry

/**
 * DeviceAdapter -- the generic MCP projection (device.list / device.state /
 * device.command) behind which any connected vendor sits. Only Tuya is
 * wired up this cycle; a second vendor is a new `case` in `callVendor()`
 * below, not a new tool_id or a new pipeline change (that IS the point of
 * the layer -- see docs/09-device-mcp-layer.md).
 *
 * Deliberate departure from BaseAdapter's buildRequest/parseResponse
 * contract: every other adapter in this repo authenticates with ONE static,
 * app-level credential (env var), so buildRequest can be synchronous.
 * Device calls authenticate with a PER-AGENT, PER-CONNECTION token that
 * must be read from Postgres, decrypted, and possibly refreshed against the
 * vendor before the call -- all async, all agent-scoped. Overriding `call()`
 * keeps that contract honest instead of forcing async work through a sync
 * interface. `buildRequest`/`parseResponse` are still implemented (required
 * abstract members) but are never reached.
 */
export class DeviceAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'device', baseUrl: '' });
  }

  protected buildRequest(): never {
    throw new Error('DeviceAdapter.buildRequest is unused -- see class doc, call() is overridden');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const action = req.toolId.split('.')[1];
    const agentId = req.agentId;

    if (!agentId) {
      throw deviceError(
        ProviderErrorCode.INPUT_REJECTED,
        401,
        'Device tools require an authenticated agent',
        req.toolId,
        Math.round(performance.now() - start),
      );
    }

    const params = (req.params ?? {}) as Record<string, unknown>;

    try {
      if (action === 'list') {
        return okResponse(await this.doList(agentId), start);
      }
      if (action === 'state') {
        const connectionId = String(params.connection_id ?? '');
        const deviceId = String(params.device_id ?? '');
        return okResponse(await this.doState(agentId, connectionId, deviceId), start);
      }
      if (action === 'command') {
        const connectionId = String(params.connection_id ?? '');
        const deviceId = String(params.device_id ?? '');
        const command = String(params.command ?? '');
        const value = params.value;
        const confirm = typeof params.confirm === 'boolean' ? params.confirm : undefined;
        return okResponse(
          await this.doCommand(agentId, connectionId, deviceId, command, value, confirm),
          start,
        );
      }
      throw deviceError(
        ProviderErrorCode.INPUT_REJECTED,
        422,
        `Unknown device action '${action}' (expected list/state/command)`,
        req.toolId,
        Math.round(performance.now() - start),
      );
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      if (error instanceof DeviceSafetyViolation) {
        throw deviceError(
          ProviderErrorCode.INPUT_REJECTED,
          422,
          error.message,
          req.toolId,
          durationMs,
        );
      }
      if (this.isDeviceError(error)) {
        throw error;
      }
      logger.warn(
        { request_id: req.requestId, tool_id: req.toolId, err: (error as Error).message },
        'Device adapter call failed',
      );
      throw deviceError(
        ProviderErrorCode.UNAVAILABLE,
        502,
        `Device vendor call failed: ${(error as Error).message}`,
        req.toolId,
        durationMs,
      );
    }
  }

  private isDeviceError(e: unknown): e is ProviderError {
    return typeof e === 'object' && e !== null && 'provider' in e && 'httpStatus' in e;
  }

  private async doList(agentId: string): Promise<unknown> {
    const connections = await listActiveConnections(agentId);
    const out: unknown[] = [];
    for (const conn of connections) {
      const owned = await getOwnedConnection(agentId, conn.connection_id);
      if (!owned) continue;
      const devices = await this.callVendor(owned.vendor, 'list', owned);
      out.push({ connection_id: conn.connection_id, vendor: conn.vendor, devices });
    }
    return { connections: out };
  }

  private async doState(agentId: string, connectionId: string, deviceId: string): Promise<unknown> {
    if (!connectionId || !deviceId) {
      throw deviceError(
        ProviderErrorCode.INPUT_REJECTED,
        422,
        'connection_id and device_id are required',
        'device.state',
        0,
      );
    }
    const owned = await getOwnedConnection(agentId, connectionId);
    if (!owned) {
      throw deviceError(
        ProviderErrorCode.INPUT_REJECTED,
        404,
        'No such active connection for this agent',
        'device.state',
        0,
      );
    }
    return this.callVendor(owned.vendor, 'state', owned, deviceId);
  }

  private async doCommand(
    agentId: string,
    connectionId: string,
    deviceId: string,
    command: string,
    value: unknown,
    confirm: boolean | undefined,
  ): Promise<unknown> {
    if (!connectionId || !deviceId || !command) {
      throw deviceError(
        ProviderErrorCode.INPUT_REJECTED,
        422,
        'connection_id, device_id and command are required',
        'device.command',
        0,
      );
    }
    const owned = await getOwnedConnection(agentId, connectionId);
    if (!owned) {
      throw deviceError(
        ProviderErrorCode.INPUT_REJECTED,
        404,
        'No such active connection for this agent',
        'device.command',
        0,
      );
    }

    // Best-effort class lookup for the safety gate -- see TUYA_CATEGORY_TO_CLASS
    // doc comment. We need the device's category from a fresh state read
    // when we don't already know it; cheap since Tuya's /status call is the
    // same one `state` uses and this repo already treats every provider
    // call as billable, so one extra call here is one extra billed step
    // the caller can see on the ledger, not a hidden cost.
    const deviceClass = await this.classifyDevice(owned.vendor, owned, deviceId);
    enforceDeviceSafety(deviceClass, command, value, confirm);

    return this.callVendor(owned.vendor, 'command', owned, deviceId, command, value);
  }

  private async classifyDevice(
    vendor: string,
    owned: Awaited<ReturnType<typeof getOwnedConnection>> & object,
    deviceId: string,
  ): Promise<string | undefined> {
    if (vendor !== 'tuya') return undefined;
    const cfg = tuyaConfig();
    if (!cfg) return undefined;
    try {
      const token = await this.ensureFreshTuyaToken(owned);
      const devices = await tuyaListDevices(cfg, owned.vendor_user_id ?? '', token);
      const match = devices.find((d) => d.id === deviceId);
      return match ? TUYA_CATEGORY_TO_CLASS[match.category] : undefined;
    } catch {
      return undefined; // classification failure must never block a command by itself
    }
  }

  private async ensureFreshTuyaToken(
    owned: NonNullable<Awaited<ReturnType<typeof getOwnedConnection>>>,
  ): Promise<string> {
    const cfg = tuyaConfig();
    if (!cfg)
      throw new Error('Tuya is not configured (TUYA_CLIENT_ID/SECRET/API_BASE_URL missing)');
    if (owned.tokenExpiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS) {
      return owned.accessToken;
    }
    const refreshed = await tuyaRefreshToken(cfg, owned.refreshToken);
    await rotateTokens(owned.connection_id, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresInSec: refreshed.expireTimeSec,
    });
    return refreshed.accessToken;
  }

  private async callVendor(
    vendor: string,
    op: 'list' | 'state' | 'command',
    owned: NonNullable<Awaited<ReturnType<typeof getOwnedConnection>>>,
    deviceId?: string,
    command?: string,
    value?: unknown,
  ): Promise<unknown> {
    if (vendor !== 'tuya') {
      throw deviceError(
        ProviderErrorCode.INPUT_REJECTED,
        501,
        `Vendor '${vendor}' has no adapter implementation`,
        `device.${op}`,
        0,
      );
    }
    const cfg = tuyaConfig();
    if (!cfg) {
      throw deviceError(
        ProviderErrorCode.PROVIDER_AUTH,
        503,
        'Tuya is not configured on this server',
        `device.${op}`,
        0,
      );
    }
    const token = await this.ensureFreshTuyaToken(owned);

    if (op === 'list') {
      return tuyaListDevices(cfg, owned.vendor_user_id ?? '', token);
    }
    if (op === 'state') {
      return tuyaGetStatus(cfg, deviceId as string, token);
    }
    // op === 'command'
    const success = await tuyaSendCommand(cfg, deviceId as string, command as string, value, token);
    return { success };
  }
}
