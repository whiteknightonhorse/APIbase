import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { AvwxNotamResponse, AvwxPirepResponse, AvwxStationSummary } from './types';

const AVWX_BASE = 'https://avwx.rest/api';

/**
 * AVWX Aviation Weather adapter (UC-424).
 *
 * Supported tools:
 *   avwx.notams           → GET /notam/{ICAO_CODE}?distance={d}
 *   avwx.pireps           → GET /pirep/station/{ICAO_CODE}
 *   avwx.station_summary  → GET /summary/{ICAO_CODE}
 *
 * Auth: Authorization: BEARER <KEY> (uppercase BEARER per AVWX docs).
 * URL-encode all ICAO path params per flywheel [2026-04-05].
 *
 * Unique value:
 *   - Parsed NOTAMs (Notice to Airmen) — not available from NOAA AWC or CheckWX
 *   - Parsed PIREPs (Pilot Reports) — not available from NOAA AWC or CheckWX
 */
export class AvwxAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'avwx',
      baseUrl: AVWX_BASE,
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    // AVWX docs specify uppercase BEARER (not standard Bearer)
    const headers: Record<string, string> = {
      Authorization: `BEARER ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };

    switch (req.toolId) {
      case 'avwx.notams': {
        // URL-encode ICAO path param per flywheel [2026-04-05]
        const icao = encodeURIComponent(String(params.icao_code).toUpperCase());
        const distance = params.distance !== undefined ? Number(params.distance) : 10;
        return {
          url: `${AVWX_BASE}/notam/${icao}?distance=${distance}`,
          method: 'GET',
          headers,
        };
      }

      case 'avwx.pireps': {
        const icao = encodeURIComponent(String(params.icao_code).toUpperCase());
        return {
          url: `${AVWX_BASE}/pirep/${icao}`,
          method: 'GET',
          headers,
        };
      }

      case 'avwx.station_summary': {
        const icao = encodeURIComponent(String(params.icao_code).toUpperCase());
        return {
          url: `${AVWX_BASE}/summary/${icao}`,
          method: 'GET',
          headers,
        };
      }

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
    // 401 = bad key (handled by base as 4xx)
    // 503 with meta.warning = AVWX testing mode warning — still return data
    // 200 with empty arrays/null = no data found, not an error

    switch (req.toolId) {
      case 'avwx.notams': {
        const body = raw.body as AvwxNotamResponse;
        // Empty data array is valid (no NOTAMs in area)
        return body;
      }

      case 'avwx.pireps': {
        const body = raw.body as AvwxPirepResponse;
        // Empty array is valid (no PIREPs filed for station)
        if (!Array.isArray(body)) {
          // Some AVWX responses wrap in an object — return as-is
          return body;
        }
        return body;
      }

      case 'avwx.station_summary': {
        const body = raw.body as AvwxStationSummary;
        return body;
      }

      default:
        return raw.body;
    }
  }
}
