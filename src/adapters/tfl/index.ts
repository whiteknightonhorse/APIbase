import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { TflArrival, TflBikePoint, TflJourneyResponse, TflLineStatus } from './types';

/**
 * Transport for London (TfL) Unified API adapter (UC-568).
 *
 * Supported tools (read-only, no auth — TfL Open Data, CC-BY):
 *   tfl.line_status   → GET /Line/Mode/{modes}/Status — real-time service status
 *   tfl.arrivals      → GET /Line/{line}/Arrivals/{stopId} — live arrival predictions
 *   tfl.journey_plan  → GET /Journey/JourneyResults/{from}/to/{to} — journey planner
 *   tfl.bike_points   → GET /BikePoint — Santander Cycles docking station availability
 *
 * Base API: https://api.tfl.gov.uk
 * Docs: https://api-portal.tfl.gov.uk
 * License: TfL Open Data — free for commercial use with attribution.
 */
export class TflAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'tfl',
      baseUrl: 'https://api.tfl.gov.uk',
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
      case 'tfl.line_status':
        return this.buildLineStatusRequest(params, headers);
      case 'tfl.arrivals':
        return this.buildArrivalsRequest(params, headers);
      case 'tfl.journey_plan':
        return this.buildJourneyRequest(params, headers);
      case 'tfl.bike_points':
        return this.buildBikePointsRequest(params, headers);
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
      case 'tfl.line_status':
        return this.parseLineStatus(raw, req);
      case 'tfl.arrivals':
        return this.parseArrivals(raw, req);
      case 'tfl.journey_plan':
        return this.parseJourney(raw, req);
      case 'tfl.bike_points':
        return this.parseBikePoints(raw, req);
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildLineStatusRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const modes = params.modes
      ? encodeURIComponent(String(params.modes))
      : 'tube%2Coverground%2Celizabeth-line%2Cdlr%2Clondon-overground';

    const qs = new URLSearchParams();
    if (params.detail === true) qs.set('detail', 'true');

    const qstr = qs.toString();
    return {
      url: `${this.baseUrl}/Line/Mode/${modes}/Status${qstr ? '?' + qstr : ''}`,
      method: 'GET',
      headers,
    };
  }

  private buildArrivalsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const lineId = encodeURIComponent(String(params.line_id));
    const stopId = encodeURIComponent(String(params.stop_id));

    const qs = new URLSearchParams();
    if (params.direction) qs.set('direction', String(params.direction));

    const qstr = qs.toString();
    return {
      url: `${this.baseUrl}/Line/${lineId}/Arrivals/${stopId}${qstr ? '?' + qstr : ''}`,
      method: 'GET',
      headers,
    };
  }

  private buildJourneyRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const from = encodeURIComponent(String(params.from));
    const to = encodeURIComponent(String(params.to));

    const qs = new URLSearchParams();
    if (params.mode) qs.set('mode', String(params.mode));
    if (params.date) qs.set('date', String(params.date));
    if (params.time) qs.set('time', String(params.time));
    if (params.time_is) qs.set('timeIs', String(params.time_is));

    const qstr = qs.toString();
    return {
      url: `${this.baseUrl}/Journey/JourneyResults/${from}/to/${to}${qstr ? '?' + qstr : ''}`,
      method: 'GET',
      headers,
    };
  }

  private buildBikePointsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.query) qs.set('query', String(params.query));

    const qstr = qs.toString();
    return {
      url: `${this.baseUrl}/BikePoint${qstr ? '?' + qstr : ''}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseLineStatus(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const params = req.params as Record<string, unknown>;
    const lines = raw.body as unknown as TflLineStatus[];

    if (!Array.isArray(lines)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'TfL line status returned unexpected format',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const includeGoodService = params.include_good_service !== false;

    const filtered = includeGoodService
      ? lines
      : lines.filter((l) =>
          l.lineStatuses.some((s) => s.statusSeverityDescription !== 'Good Service'),
        );

    return {
      total_lines: lines.length,
      disrupted_lines: lines.filter((l) =>
        l.lineStatuses.some((s) => s.statusSeverityDescription !== 'Good Service'),
      ).length,
      lines: filtered.map((l) => ({
        id: l.id,
        name: l.name,
        mode: l.modeName,
        status: l.lineStatuses[0]?.statusSeverityDescription ?? 'Unknown',
        severity: l.lineStatuses[0]?.statusSeverity ?? 0,
        reason: l.lineStatuses[0]?.reason ?? null,
      })),
    };
  }

  private parseArrivals(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const params = req.params as Record<string, unknown>;
    const arrivals = raw.body as unknown as TflArrival[];

    if (!Array.isArray(arrivals)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'TfL arrivals returned unexpected format',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const limit = typeof params.limit === 'number' ? Math.min(params.limit, 50) : 20;
    const sorted = [...arrivals].sort((a, b) => a.timeToStation - b.timeToStation).slice(0, limit);

    return {
      stop_name: sorted[0]?.stationName ?? null,
      count: sorted.length,
      arrivals: sorted.map((a) => ({
        line: a.lineName,
        destination: a.destinationName,
        platform: a.platformName,
        direction: a.direction,
        expected_arrival: a.expectedArrival,
        minutes_away: Math.round(a.timeToStation / 60),
        towards: a.towards ?? null,
      })),
    };
  }

  private parseJourney(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const params = req.params as Record<string, unknown>;
    const body = raw.body as unknown as TflJourneyResponse;
    const journeys = body?.journeys ?? [];

    const limit = typeof params.limit === 'number' ? Math.min(params.limit, 5) : 3;
    const sliced = journeys.slice(0, limit);

    return {
      journey_count: journeys.length,
      journeys: sliced.map((j) => ({
        departure: j.startDateTime,
        arrival: j.arrivalDateTime,
        duration_minutes: j.duration,
        legs: j.legs.map((leg) => ({
          mode: leg.mode?.name ?? 'walk',
          duration_minutes: leg.duration,
          from: leg.departurePoint?.commonName ?? '',
          to: leg.arrivalPoint?.commonName ?? '',
          departs: leg.departureTime,
          arrives: leg.arrivalTime,
          summary: leg.instruction?.summary ?? '',
          detail: leg.instruction?.detailed ?? '',
        })),
      })),
    };
  }

  private parseBikePoints(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const params = req.params as Record<string, unknown>;
    const points = raw.body as unknown as TflBikePoint[];

    if (!Array.isArray(points)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'TfL bike points returned unexpected format',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const limit = typeof params.limit === 'number' ? Math.min(params.limit, 200) : 50;
    const sliced = points.slice(0, limit);

    return {
      total_stations: points.length,
      returned: sliced.length,
      stations: sliced.map((p) => {
        const props = Object.fromEntries(p.additionalProperties.map((ap) => [ap.key, ap.value]));
        return {
          id: p.id,
          name: p.commonName,
          lat: p.lat,
          lon: p.lon,
          bikes_available: parseInt(props['NbBikes'] ?? '0', 10),
          empty_docks: parseInt(props['NbEmptyDocks'] ?? '0', 10),
          total_docks: parseInt(props['NbDocks'] ?? '0', 10),
          e_bikes: parseInt(props['NbEBikes'] ?? '0', 10),
          locked: props['Locked'] === 'true',
          installed: props['Installed'] === 'true',
        };
      }),
    };
  }
}
