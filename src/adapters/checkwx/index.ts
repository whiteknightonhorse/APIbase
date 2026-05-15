import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CheckWxEnvelope,
  CheckWxMetarDecoded,
  CheckWxTafDecoded,
  CheckWxStation,
} from './types';

const CHECKWX_BASE = 'https://api.checkwx.com';

/**
 * CheckWX Aviation Weather adapter (UC-423).
 *
 * Supported tools:
 *   checkwx.metar_decoded  → GET /metar/{ICAO_CODES}/decoded
 *   checkwx.taf_decoded    → GET /taf/{ICAO_CODES}/decoded
 *   checkwx.station_info   → GET /station/{ICAO_CODE}
 *
 * Auth: X-API-Key header. AMBER ToS — commercial use OK with attribution.
 * Returns pre-decoded JSON — saves agents from parsing raw METAR/TAF strings.
 * URL-encode all path params per flywheel [2026-04-05].
 */
export class CheckWxAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'checkwx',
      baseUrl: CHECKWX_BASE,
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
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };

    switch (req.toolId) {
      case 'checkwx.metar_decoded': {
        // icao_codes is comma-separated — URL-encode per flywheel [2026-04-05]
        const codes = encodeURIComponent(String(params.icao_codes));
        return {
          url: `${CHECKWX_BASE}/metar/${codes}/decoded`,
          method: 'GET',
          headers,
        };
      }

      case 'checkwx.taf_decoded': {
        const codes = encodeURIComponent(String(params.icao_codes));
        return {
          url: `${CHECKWX_BASE}/taf/${codes}/decoded`,
          method: 'GET',
          headers,
        };
      }

      case 'checkwx.station_info': {
        const code = encodeURIComponent(String(params.icao_code));
        return {
          url: `${CHECKWX_BASE}/station/${code}`,
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
    // 401 is handled by base adapter as 4xx — 401 = bad key
    const body = raw.body as CheckWxEnvelope<unknown>;

    switch (req.toolId) {
      case 'checkwx.metar_decoded': {
        const envelope = body as CheckWxEnvelope<CheckWxMetarDecoded>;
        if (!Array.isArray(envelope.data)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid METAR decoded response: expected {data: [...]}',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        // Preserve full CheckWX envelope — {data: [...], results: N}
        return envelope;
      }

      case 'checkwx.taf_decoded': {
        const envelope = body as CheckWxEnvelope<CheckWxTafDecoded>;
        if (!Array.isArray(envelope.data)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid TAF decoded response: expected {data: [...]}',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return envelope;
      }

      case 'checkwx.station_info': {
        const envelope = body as CheckWxEnvelope<CheckWxStation>;
        if (!Array.isArray(envelope.data)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid station info response: expected {data: [...]}',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return envelope;
      }

      default:
        return raw.body;
    }
  }
}
