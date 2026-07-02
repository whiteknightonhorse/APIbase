import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { RawStatesResponse, RawStateVector, RawTrackResponse } from './types';

/**
 * OpenSky Network ADS-B adapter (UC-566).
 *
 * Supported tools (read-only, no auth required):
 *   opensky.states_bbox    → GET /states/all?lamin&lomin&lamax&lomax
 *   opensky.aircraft_state → GET /states/all?icao24={icao24}
 *   opensky.states_country → GET /states/all (filtered by origin_country client-side)
 *   opensky.aircraft_track → GET /tracks/all?icao24={icao24}&time=0
 *
 * Auth: None (open Community Edition, anonymous access).
 * Rate limit: ~10s between requests for anonymous users (enforced by cache TTL).
 */
export class OpenSkyAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'opensky',
      baseUrl: 'https://opensky-network.org/api',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'opensky.states_bbox':
        return this.buildStatesBboxRequest(params, headers);
      case 'opensky.aircraft_state':
        return this.buildAircraftStateRequest(params, headers);
      case 'opensky.states_country':
        return this.buildStatesCountryRequest(params, headers);
      case 'opensky.aircraft_track':
        return this.buildAircraftTrackRequest(params, headers);
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
      case 'opensky.states_bbox':
      case 'opensky.states_country':
        return this.parseStatesResponse(raw, req);
      case 'opensky.aircraft_state':
        return this.parseAircraftStateResponse(raw, req);
      case 'opensky.aircraft_track':
        return this.parseTrackResponse(body as unknown as RawTrackResponse);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildStatesBboxRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('lamin', String(params.lamin));
    qs.set('lomin', String(params.lomin));
    qs.set('lamax', String(params.lamax));
    qs.set('lomax', String(params.lomax));

    return { url: `${this.baseUrl}/states/all?${qs.toString()}`, method: 'GET', headers };
  }

  private buildAircraftStateRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const icao24 = encodeURIComponent(String(params.icao24).toLowerCase());
    return { url: `${this.baseUrl}/states/all?icao24=${icao24}`, method: 'GET', headers };
  }

  private buildStatesCountryRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    // OpenSky does not support server-side country filtering — we fetch all and filter client-side.
    // Add a conservative bbox covering the whole world to keep response size reasonable.
    const qs = new URLSearchParams();
    if (params.lamin !== undefined) qs.set('lamin', String(params.lamin));
    if (params.lomin !== undefined) qs.set('lomin', String(params.lomin));
    if (params.lamax !== undefined) qs.set('lamax', String(params.lamax));
    if (params.lomax !== undefined) qs.set('lomax', String(params.lomax));

    const qStr = qs.toString();
    return { url: `${this.baseUrl}/states/all${qStr ? '?' + qStr : ''}`, method: 'GET', headers };
  }

  private buildAircraftTrackRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const icao24 = encodeURIComponent(String(params.icao24).toLowerCase());
    const time = params.time !== undefined ? String(params.time) : '0';
    return {
      url: `${this.baseUrl}/tracks/all?icao24=${icao24}&time=${time}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseStatesResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as unknown as RawStatesResponse;
    const params = req.params as Record<string, unknown>;
    const limit = params.limit ? Number(params.limit) : 100;
    const country =
      req.toolId === 'opensky.states_country' && params.country
        ? String(params.country).toLowerCase()
        : null;

    let states = body.states ?? [];

    if (country) {
      states = states.filter((s) => s[2]?.toLowerCase() === country);
    }

    if (states.length > limit) {
      states = states.slice(0, limit);
    }

    return {
      timestamp: body.time,
      count: states.length,
      aircraft: states.map((s) => this.normalizeStateVector(s)),
    };
  }

  private parseAircraftStateResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as unknown as RawStatesResponse;
    const states = body.states ?? [];

    if (states.length === 0) {
      return {
        timestamp: body.time,
        found: false,
        aircraft: null,
      };
    }

    return {
      timestamp: body.time,
      found: true,
      aircraft: this.normalizeStateVector(states[0]),
    };
  }

  private parseTrackResponse(track: RawTrackResponse): unknown {
    return {
      icao24: track.icao24,
      callsign: track.callsign?.trim() || null,
      start_time: track.startTime,
      end_time: track.endTime,
      waypoint_count: track.path?.length ?? 0,
      waypoints: (track.path ?? []).map((w) => ({
        time: w[0],
        latitude: w[1],
        longitude: w[2],
        baro_altitude_m: w[3],
        true_track_deg: w[4],
        on_ground: w[5],
      })),
    };
  }

  private normalizeStateVector(s: RawStateVector): Record<string, unknown> {
    const positionSources: Record<number, string> = {
      0: 'ADS-B',
      1: 'ASTERIX',
      2: 'MLAT',
      3: 'FLARM',
    };

    return {
      icao24: s[0],
      callsign: s[1]?.trim() || null,
      origin_country: s[2],
      time_position: s[3],
      last_contact: s[4],
      longitude: s[5],
      latitude: s[6],
      baro_altitude_m: s[7],
      on_ground: s[8],
      velocity_ms: s[9],
      true_track_deg: s[10],
      vertical_rate_ms: s[11],
      geo_altitude_m: s[13],
      squawk: s[14],
      spi: s[15],
      position_source: positionSources[s[16]] ?? String(s[16]),
    };
  }
}
