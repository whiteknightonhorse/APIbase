import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { AvwxMetarEntry, AvwxTafEntry, AvwxPirepEntry, AvwxStationEntry } from './types';

/**
 * NOAA Aviation Weather Center adapter (UC-575).
 *
 * Supported tools (read-only, no auth):
 *   aviationweather.metar    → GET /api/data/metar?ids=...&format=json
 *   aviationweather.taf      → GET /api/data/taf?ids=...&format=json
 *   aviationweather.pirep    → GET /api/data/pirep?id=...&format=json
 *   aviationweather.stations → GET /api/data/stationinfo?ids=...&format=json
 *
 * Auth: None (US Government public domain, commercial use OK).
 * Base: https://aviationweather.gov
 */
export class AviationWeatherAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'aviationweather',
      baseUrl: 'https://aviationweather.gov',
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
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'aviationweather.metar': {
        const ids = params.ids as string;
        const hoursBack = (params.hours_back as number | undefined) ?? 1;
        const qs = new URLSearchParams({
          ids: ids.toUpperCase(),
          format: 'json',
          hours: String(hoursBack),
        });
        return {
          url: `${this.baseUrl}/api/data/metar?${qs}`,
          method: 'GET',
          headers,
        };
      }

      case 'aviationweather.taf': {
        const ids = params.ids as string;
        const qs = new URLSearchParams({
          ids: ids.toUpperCase(),
          format: 'json',
        });
        return {
          url: `${this.baseUrl}/api/data/taf?${qs}`,
          method: 'GET',
          headers,
        };
      }

      case 'aviationweather.pirep': {
        const id = params.id as string;
        const age = (params.age as number | undefined) ?? 2;
        const distance = (params.distance as number | undefined) ?? 100;
        const qs = new URLSearchParams({
          id: id.toUpperCase(),
          format: 'json',
          age: String(age),
          distance: String(distance),
        });
        return {
          url: `${this.baseUrl}/api/data/pirep?${qs}`,
          method: 'GET',
          headers,
        };
      }

      case 'aviationweather.stations': {
        const qs = new URLSearchParams({ format: 'json' });
        if (params.ids) {
          qs.set('ids', (params.ids as string).toUpperCase());
        } else if (params.bbox) {
          qs.set('bbox', params.bbox as string);
        } else if (params.state) {
          qs.set('state', (params.state as string).toUpperCase());
        }
        return {
          url: `${this.baseUrl}/api/data/stationinfo?${qs}`,
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
    const body = raw.body as unknown;

    switch (req.toolId) {
      case 'aviationweather.metar': {
        const entries = body as AvwxMetarEntry[];
        if (!Array.isArray(entries) || entries.length === 0) {
          return { count: 0, stations: [] };
        }
        return {
          count: entries.length,
          stations: entries.map((e) => ({
            icao_id: e.icaoId,
            name: e.name,
            observation_time: e.reportTime,
            latitude: e.lat,
            longitude: e.lon,
            elevation_m: e.elev,
            temperature_c: e.temp,
            dewpoint_c: e.dewp,
            wind_direction: e.wdir,
            wind_speed_kt: e.wspd,
            wind_gust_kt: e.wgst ?? null,
            visibility: e.visib,
            altimeter_hpa: e.altim,
            sea_level_pressure_hpa: e.slp,
            flight_category: e.fltCat ?? null,
            sky_cover: e.cover ?? null,
            clouds: e.clouds ?? [],
            weather: e.wxString ?? null,
            metar_type: e.metarType,
            raw: e.rawOb,
          })),
        };
      }

      case 'aviationweather.taf': {
        const entries = body as AvwxTafEntry[];
        if (!Array.isArray(entries) || entries.length === 0) {
          return { count: 0, forecasts: [] };
        }
        return {
          count: entries.length,
          forecasts: entries.map((e) => ({
            icao_id: e.icaoId,
            name: e.name,
            issue_time: e.issueTime,
            valid_from: new Date(e.validTimeFrom * 1000).toISOString(),
            valid_to: new Date(e.validTimeTo * 1000).toISOString(),
            latitude: e.lat,
            longitude: e.lon,
            elevation_m: e.elev,
            raw: e.rawTAF,
            periods: (e.fcsts ?? []).map((f) => ({
              time_from: new Date(f.timeFrom * 1000).toISOString(),
              time_to: new Date(f.timeTo * 1000).toISOString(),
              change_type: f.fcstChange ?? null,
              probability: f.probability ?? null,
              wind_direction: f.wdir,
              wind_speed_kt: f.wspd,
              wind_gust_kt: f.wgst ?? null,
              visibility: f.visib,
              weather: f.wxString ?? null,
              clouds: f.clouds ?? [],
            })),
          })),
        };
      }

      case 'aviationweather.pirep': {
        const entries = body as AvwxPirepEntry[];
        if (!Array.isArray(entries) || entries.length === 0) {
          return { count: 0, reports: [] };
        }
        return {
          count: entries.length,
          reports: entries.map((e) => ({
            receipt_time: e.receiptTime,
            observation_time: e.obsTime ? new Date(e.obsTime * 1000).toISOString() : null,
            station: e.icaoId,
            aircraft_type: e.acType ?? null,
            latitude: e.lat,
            longitude: e.lon,
            flight_level_ft: e.fltLvl !== null ? e.fltLvl * 100 : null,
            temperature_c: e.temp ?? null,
            wind_direction: e.wdir ?? null,
            wind_speed_kt: e.wspd ?? null,
            visibility_sm: e.visib ?? null,
            weather: e.wxString ?? null,
            icing_intensity: e.icgInt1 ?? null,
            icing_type: e.icgType1 ?? null,
            icing_base_ft: e.icgBas1 !== null ? (e.icgBas1 ?? null) * 100 : null,
            icing_top_ft: e.icgTop1 !== null ? (e.icgTop1 ?? null) * 100 : null,
            turbulence_intensity: e.tbInt1 ?? null,
            turbulence_base_ft: e.tbBas1 !== null ? (e.tbBas1 ?? null) * 100 : null,
            turbulence_top_ft: e.tbTop1 !== null ? (e.tbTop1 ?? null) * 100 : null,
            raw: e.rawOb,
          })),
        };
      }

      case 'aviationweather.stations': {
        const entries = body as AvwxStationEntry[];
        if (!Array.isArray(entries) || entries.length === 0) {
          return { count: 0, stations: [] };
        }
        return {
          count: entries.length,
          stations: entries.map((e) => ({
            id: e.id,
            icao_id: e.icaoId,
            iata_id: e.iataId,
            faa_id: e.faaId,
            wmo_id: e.wmoId,
            name: e.site,
            latitude: e.lat,
            longitude: e.lon,
            elevation_m: e.elev,
            state: e.state || null,
            country: e.country,
            observation_types: e.siteType,
          })),
        };
      }

      default:
        return body;
    }
  }
}
