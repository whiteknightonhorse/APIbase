import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  DeviceRecallResponse,
  Device510kResponse,
  DeviceEventResponse,
  DeviceClassificationResponse,
} from './types';

/**
 * OpenFDA Medical Devices adapter (UC-505).
 *
 * Supported tools (read-only):
 *   openfda_devices.recalls         → GET /device/recall.json
 *   openfda_devices.clearances_510k → GET /device/510k.json
 *   openfda_devices.adverse_events  → GET /device/event.json (MAUDE)
 *   openfda_devices.classification  → GET /device/classification.json
 *
 * Auth: api_key query param (reuses PROVIDER_KEY_OPENFDA).
 * Without key: 1,000 req/day. With key: 120,000 req/day.
 * Source: US FDA public domain, no ToS restriction on redistribution.
 */
export class OpenFdaDevicesAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'openfda_devices',
      baseUrl: 'https://api.fda.gov',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'openfda_devices.recalls':
        return this.buildRecallRequest(params, headers);
      case 'openfda_devices.clearances_510k':
        return this.build510kRequest(params, headers);
      case 'openfda_devices.adverse_events':
        return this.buildEventRequest(params, headers);
      case 'openfda_devices.classification':
        return this.buildClassificationRequest(params, headers);
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'openfda_devices.recalls': {
        const data = body as unknown as DeviceRecallResponse;
        if (!data.results) throw new Error('Missing results in OpenFDA device recall response');
        return {
          total: data.meta?.results?.total ?? 0,
          skip: data.meta?.results?.skip ?? 0,
          limit: data.meta?.results?.limit ?? 0,
          results: data.results,
        };
      }
      case 'openfda_devices.clearances_510k': {
        const data = body as unknown as Device510kResponse;
        if (!data.results) throw new Error('Missing results in OpenFDA 510(k) response');
        return {
          total: data.meta?.results?.total ?? 0,
          skip: data.meta?.results?.skip ?? 0,
          limit: data.meta?.results?.limit ?? 0,
          results: data.results,
        };
      }
      case 'openfda_devices.adverse_events': {
        const data = body as unknown as DeviceEventResponse;
        if (!data.results) throw new Error('Missing results in OpenFDA device event response');
        return {
          total: data.meta?.results?.total ?? 0,
          skip: data.meta?.results?.skip ?? 0,
          limit: data.meta?.results?.limit ?? 0,
          results: data.results,
        };
      }
      case 'openfda_devices.classification': {
        const data = body as unknown as DeviceClassificationResponse;
        if (!data.results)
          throw new Error('Missing results in OpenFDA device classification response');
        return {
          total: data.meta?.results?.total ?? 0,
          skip: data.meta?.results?.skip ?? 0,
          limit: data.meta?.results?.limit ?? 0,
          results: data.results,
        };
      }
      default:
        return body;
    }
  }

  // ─── Request builders ───────────────────────────────────────────────────

  private buildRecallRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    if (params.search) qs.set('search', String(params.search));
    if (params.limit) qs.set('limit', String(Math.min(Number(params.limit), 99)));
    else qs.set('limit', '10');
    if (params.skip) qs.set('skip', String(params.skip));
    return { url: `${this.baseUrl}/device/recall.json?${qs.toString()}`, method: 'GET', headers };
  }

  private build510kRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    if (params.search) qs.set('search', String(params.search));
    if (params.limit) qs.set('limit', String(Math.min(Number(params.limit), 99)));
    else qs.set('limit', '10');
    if (params.skip) qs.set('skip', String(params.skip));
    return { url: `${this.baseUrl}/device/510k.json?${qs.toString()}`, method: 'GET', headers };
  }

  private buildEventRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    if (params.search) qs.set('search', String(params.search));
    if (params.limit) qs.set('limit', String(Math.min(Number(params.limit), 99)));
    else qs.set('limit', '10');
    if (params.skip) qs.set('skip', String(params.skip));
    return { url: `${this.baseUrl}/device/event.json?${qs.toString()}`, method: 'GET', headers };
  }

  private buildClassificationRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    if (params.search) qs.set('search', String(params.search));
    if (params.limit) qs.set('limit', String(Math.min(Number(params.limit), 99)));
    else qs.set('limit', '10');
    if (params.skip) qs.set('skip', String(params.skip));
    return {
      url: `${this.baseUrl}/device/classification.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
