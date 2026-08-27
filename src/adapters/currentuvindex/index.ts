import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CurrentUvIndexSuccessResponse, CurrentUvIndexPoint } from './types';

/**
 * Current UV Index API adapter (UC-616).
 * https://currentuvindex.com/api
 *
 * Supported tools (read-only, no auth):
 *   currentuvindex.uv_index → /api/v1/uvi?latitude=..&longitude=..
 *
 * Auth: None (CC BY 4.0, attribution required, commercial use OK).
 * Rate limit: 500 requests/IP/day (resets 00:00 UTC) — enforced upstream by caller IP,
 * not relevant to us since all agent traffic egresses from this server's IP.
 */
export class CurrentUvIndexAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'currentuvindex',
      baseUrl: 'https://currentuvindex.com',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'currentuvindex.uv_index': {
        const params = req.params as Record<string, unknown>;
        const qs = new URLSearchParams({
          latitude: String(params.latitude),
          longitude: String(params.longitude),
        });
        return {
          url: `${this.baseUrl}/api/v1/uvi?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'currentuvindex.uv_index':
        return parseUvIndex(raw.body as CurrentUvIndexSuccessResponse);
      default:
        return raw.body;
    }
  }
}

/** WHO/EPA standard UV Index exposure-risk categories. */
function riskLevel(uvi: number): string {
  if (uvi >= 11) return 'Extreme';
  if (uvi >= 8) return 'Very High';
  if (uvi >= 6) return 'High';
  if (uvi >= 3) return 'Moderate';
  return 'Low';
}

function withRisk(point: CurrentUvIndexPoint): CurrentUvIndexPoint & { risk_level: string } {
  return { ...point, risk_level: riskLevel(point.uvi) };
}

function parseUvIndex(body: CurrentUvIndexSuccessResponse): unknown {
  const forecast = (body.forecast ?? []).map(withRisk);
  const peakForecast = forecast.reduce(
    (max, p) => (p.uvi > max.uvi ? p : max),
    forecast[0] ?? withRisk(body.now),
  );

  return {
    latitude: body.latitude,
    longitude: body.longitude,
    now: withRisk(body.now),
    peak_forecast: peakForecast,
    forecast,
    history: (body.history ?? []).map(withRisk),
  };
}
