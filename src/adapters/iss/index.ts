import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { IssPositionOutput, IssTleOutput } from './types';

const ISS_BASE = 'https://api.wheretheiss.at/v1';
const ISS_NORAD_ID = '25544';

/**
 * ISS Tracker adapter (UC-355).
 *
 * Real-time International Space Station position + TLE data.
 * No auth, free, 1 req/sec. Cache position 60s, TLE 24h.
 */
export class IssAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'iss', baseUrl: ISS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'iss.position': {
        const units = String(params.units || 'kilometers');
        return {
          url: `${ISS_BASE}/satellites/${ISS_NORAD_ID}?units=${units}`,
          method: 'GET',
          headers,
        };
      }

      case 'iss.tle': {
        return {
          url: `${ISS_BASE}/satellites/${ISS_NORAD_ID}/tles`,
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'iss.position':
        return this.parsePosition(body);
      case 'iss.tle':
        return this.parseTle(body);
      default:
        return body;
    }
  }

  private parsePosition(body: Record<string, unknown>): IssPositionOutput {
    return {
      latitude: Number(body.latitude ?? 0),
      longitude: Number(body.longitude ?? 0),
      altitude_km: Number(body.altitude ?? 0),
      velocity_kmh: Number(body.velocity ?? 0),
      visibility: String(body.visibility ?? 'unknown'),
      timestamp: Number(body.timestamp ?? 0),
    };
  }

  private parseTle(body: Record<string, unknown>): IssTleOutput {
    return {
      satellite_id: Number(body.satellite_id ?? ISS_NORAD_ID),
      name: String(body.name ?? 'ISS (ZARYA)'),
      line1: String(body.line1 ?? ''),
      line2: String(body.line2 ?? ''),
      requested_timestamp: Number(body.requested_timestamp ?? 0),
    };
  }
}
