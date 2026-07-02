import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CoopsDataResponse, CoopsRawStation, CoopsStationsResponse } from './types';

/**
 * NOAA CO-OPS Tides & Currents adapter (UC-567).
 *
 * Supported tools (read-only, no auth — US Gov NODD public domain):
 *   coops.predictions  → tide high/low predictions for a station
 *   coops.water_level  → observed 6-min water level readings for a station
 *   coops.stations     → list active tide gauge stations (with optional state filter)
 *   coops.conditions   → meteorological observations (air temp, water temp, pressure, etc.)
 *
 * Base API: https://api.tidesandcurrents.noaa.gov/api/prod/datagetter (datagetter)
 * Meta API: https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi  (stations)
 */
export class CoopsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'coops',
      baseUrl: 'https://api.tidesandcurrents.noaa.gov',
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
      case 'coops.predictions':
        return this.buildPredictionsUrl(params, headers);
      case 'coops.water_level':
        return this.buildWaterLevelUrl(params, headers);
      case 'coops.stations':
        return {
          url: `${this.baseUrl}/mdapi/prod/webapi/stations.json?type=waterlevels&units=english`,
          method: 'GET',
          headers,
        };
      case 'coops.conditions':
        return this.buildConditionsUrl(params, headers);
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
      case 'coops.predictions':
        return this.parsePredictions(raw, req);
      case 'coops.water_level':
        return this.parseWaterLevel(raw, req);
      case 'coops.stations':
        return this.parseStations(raw, req);
      case 'coops.conditions':
        return this.parseConditions(raw, req);
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildPredictionsUrl(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams({
      station: encodeURIComponent(String(params.station_id)),
      product: 'predictions',
      datum: params.datum ? String(params.datum) : 'MLLW',
      time_zone: 'gmt',
      units: params.units === 'metric' ? 'metric' : 'english',
      begin_date: params.begin_date ? toCoopsDate(String(params.begin_date)) : todayStr(),
      end_date: params.end_date ? toCoopsDate(String(params.end_date)) : offsetDate(7),
      interval: 'hilo',
      format: 'json',
    });
    return { url: `${this.baseUrl}/api/prod/datagetter?${qs}`, method: 'GET', headers };
  }

  private buildWaterLevelUrl(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams({
      station: encodeURIComponent(String(params.station_id)),
      product: 'water_level',
      datum: params.datum ? String(params.datum) : 'MLLW',
      time_zone: 'gmt',
      units: params.units === 'metric' ? 'metric' : 'english',
      begin_date: params.begin_date ? toCoopsDate(String(params.begin_date)) : offsetDate(-1),
      end_date: params.end_date ? toCoopsDate(String(params.end_date)) : todayStr(),
      format: 'json',
    });
    return { url: `${this.baseUrl}/api/prod/datagetter?${qs}`, method: 'GET', headers };
  }

  private buildConditionsUrl(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const ALLOWED_PRODUCTS = new Set([
      'air_temperature',
      'water_temperature',
      'air_pressure',
      'humidity',
      'wind',
    ]);
    const product =
      params.product && ALLOWED_PRODUCTS.has(String(params.product))
        ? String(params.product)
        : 'air_temperature';

    const qs = new URLSearchParams({
      station: encodeURIComponent(String(params.station_id)),
      product,
      time_zone: 'gmt',
      units: params.units === 'metric' ? 'metric' : 'english',
      begin_date: params.begin_date ? toCoopsDate(String(params.begin_date)) : offsetDate(-1),
      end_date: params.end_date ? toCoopsDate(String(params.end_date)) : todayStr(),
      format: 'json',
    });
    return { url: `${this.baseUrl}/api/prod/datagetter?${qs}`, method: 'GET', headers };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parsePredictions(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as CoopsDataResponse;
    const params = req.params as Record<string, unknown>;

    if (body.error) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `NOAA CO-OPS: ${body.error.message}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const predictions = body.predictions ?? [];
    const limit = params.limit ? Math.min(Number(params.limit), 500) : 100;
    const sliced = predictions.slice(0, limit);

    return {
      station_id: String(params.station_id),
      datum: params.datum ?? 'MLLW',
      units: params.units === 'metric' ? 'meters' : 'feet',
      time_zone: 'UTC',
      count: sliced.length,
      predictions: sliced.map((p) => ({
        time_utc: p.t,
        height: parseFloat(p.v),
        type: p.type === 'H' ? 'high' : 'low',
      })),
    };
  }

  private parseWaterLevel(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as CoopsDataResponse;
    const params = req.params as Record<string, unknown>;

    if (body.error) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `NOAA CO-OPS: ${body.error.message}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const data = body.data ?? [];
    const meta = body.metadata ?? { id: String(params.station_id), name: '', lat: '0', lon: '0' };
    const limit = params.limit ? Math.min(Number(params.limit), 500) : 120;
    const sliced = data.slice(0, limit);

    return {
      station_id: meta.id,
      station_name: meta.name,
      latitude: parseFloat(meta.lat),
      longitude: parseFloat(meta.lon),
      datum: params.datum ?? 'MLLW',
      units: params.units === 'metric' ? 'meters' : 'feet',
      time_zone: 'UTC',
      count: sliced.length,
      readings: sliced.map((r) => ({
        time_utc: r.t,
        water_level: parseFloat(r.v),
        sigma: r.s !== undefined ? parseFloat(r.s) : undefined,
        quality: r.q ?? undefined,
      })),
    };
  }

  private parseStations(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as CoopsStationsResponse;
    const stations = body.stations ?? [];
    const params = req.params as Record<string, unknown>;
    const stateFilter = params.state ? String(params.state).toUpperCase() : null;
    const tidalsOnly = params.tidal_only !== false;
    const limit = params.limit ? Math.min(Number(params.limit), 200) : 50;

    let filtered: CoopsRawStation[] = stations;
    if (stateFilter) {
      filtered = filtered.filter((s) => s.state?.toUpperCase() === stateFilter);
    }
    if (tidalsOnly) {
      filtered = filtered.filter((s) => s.tidal);
    }

    const sliced = filtered.slice(0, limit);

    return {
      total_matching: filtered.length,
      count: sliced.length,
      stations: sliced.map((s) => ({
        station_id: s.id,
        name: s.name,
        latitude: s.lat,
        longitude: s.lng,
        state: s.state ?? null,
        tidal: s.tidal,
        great_lakes: s.greatlakes,
        timezone: s.timezone ?? null,
        forecast_available: s.forecast ?? false,
      })),
    };
  }

  private parseConditions(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as CoopsDataResponse;
    const params = req.params as Record<string, unknown>;
    const product = params.product ? String(params.product) : 'air_temperature';

    if (body.error) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `NOAA CO-OPS: ${body.error.message}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const data = body.data ?? [];
    const meta = body.metadata ?? { id: String(params.station_id), name: '', lat: '0', lon: '0' };
    const limit = params.limit ? Math.min(Number(params.limit), 500) : 60;
    const sliced = data.slice(-limit);

    const latest = sliced.length > 0 ? sliced[sliced.length - 1] : null;

    return {
      station_id: meta.id,
      station_name: meta.name,
      latitude: parseFloat(meta.lat),
      longitude: parseFloat(meta.lon),
      product,
      units: params.units === 'metric' ? 'metric' : 'english',
      time_zone: 'UTC',
      count: sliced.length,
      latest_reading: latest ? { time_utc: latest.t, value: parseFloat(latest.v) } : null,
      readings: sliced.map((r) => ({
        time_utc: r.t,
        value: parseFloat(r.v),
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// Date helpers — computed at request time so "today" is always current
// ---------------------------------------------------------------------------

function todayStr(): string {
  return toCoopsDate(new Date());
}

function offsetDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toCoopsDate(d);
}

function toCoopsDate(input: Date | string): string {
  if (typeof input === 'string') {
    // Accept YYYY-MM-DD or YYYYMMDD
    return input.replace(/-/g, '').slice(0, 8);
  }
  return input.toISOString().slice(0, 10).replace(/-/g, '');
}
