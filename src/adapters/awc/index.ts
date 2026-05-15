import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { AwcMetarRecord, AwcTafRecord, AwcSigmetRecord } from './types';

/**
 * NOAA Aviation Weather Center (AWC) adapter (UC-422).
 *
 * Supported tools:
 *   awc.metar   → GET /api/data/metar?ids={ICAO}&format=json&taf=false&hours={N}
 *   awc.taf     → GET /api/data/taf?ids={ICAO}&format=json
 *   awc.sigmet  → GET /api/data/airsigmet?format=json&type=sigmet
 *
 * Auth: none — US Federal Government open public domain API.
 * Rate limit: be polite; no documented hard limit.
 */
export class AwcAdapter extends BaseAdapter {
  private static readonly AWC_BASE = 'https://aviationweather.gov/api/data';
  private static readonly USER_AGENT = 'APIbase-Gateway/1.0 (https://apibase.pro)';

  constructor() {
    super({
      provider: 'awc',
      baseUrl: AwcAdapter.AWC_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'awc.metar':
        return this.buildMetar(req.params as Record<string, unknown>);
      case 'awc.taf':
        return this.buildTaf(req.params as Record<string, unknown>);
      case 'awc.sigmet':
        return this.buildSigmet();
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
    switch (req.toolId) {
      case 'awc.metar': {
        const data = raw.body as AwcMetarRecord[];
        // Empty array is valid — airport may have no recent observations
        if (!Array.isArray(data)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid METAR response: expected array',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'awc.taf': {
        const data = raw.body as AwcTafRecord[];
        // Empty array is valid — airport may not have a TAF
        if (!Array.isArray(data)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid TAF response: expected array',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'awc.sigmet': {
        const data = raw.body as AwcSigmetRecord[];
        // Empty array is valid — no active SIGMETs is normal
        if (!Array.isArray(data)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid SIGMET response: expected array',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private awcHeaders(): Record<string, string> {
    return {
      'User-Agent': AwcAdapter.USER_AGENT,
      Accept: 'application/json',
    };
  }

  private buildMetar(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    // URL-encode the icao_codes param per flywheel [2026-04-05]
    const ids = encodeURIComponent(String(params.icao_codes));
    const hours = params.hours ?? 2;
    const url = `${AwcAdapter.AWC_BASE}/metar?ids=${ids}&format=json&taf=false&hours=${encodeURIComponent(String(hours))}`;
    return {
      url,
      method: 'GET',
      headers: this.awcHeaders(),
    };
  }

  private buildTaf(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const ids = encodeURIComponent(String(params.icao_codes));
    const url = `${AwcAdapter.AWC_BASE}/taf?ids=${ids}&format=json`;
    return {
      url,
      method: 'GET',
      headers: this.awcHeaders(),
    };
  }

  private buildSigmet(): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    return {
      url: `${AwcAdapter.AWC_BASE}/airsigmet?format=json&type=sigmet`,
      method: 'GET',
      headers: this.awcHeaders(),
    };
  }
}
