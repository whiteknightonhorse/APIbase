import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GeoJsonFeatureCollection,
  ClimateStationProperties,
  ClimateDailyProperties,
  HydrometricRealtimeProperties,
  AqhiObservationProperties,
} from './types';

const GEOMET_BASE = 'https://api.weather.gc.ca';

const PROV_TERR_CODES = new Set([
  'AB',
  'BC',
  'MB',
  'NB',
  'NL',
  'NS',
  'NT',
  'NU',
  'ON',
  'PE',
  'QC',
  'SK',
  'YT',
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * MSC GeoMet OGC API - Features adapter (UC-657).
 *
 * api.weather.gc.ca is Environment and Climate Change Canada's public OGC API for the
 * Meteorological Service of Canada (MSC): weather, climate, hydrometric and air-quality
 * data across 100+ collections. No auth. Every tool here maps to one GET on
 * /collections/{id}/items — the upstream `limit` param is NOT capped server-side (a raw
 * limit=100000 request returns 8000+ features / 8MB+), so each tool clamps `limit`
 * client-side to stay well under the platform's response size ceiling.
 *   msc-geomet.climate_stations    -> climate-stations collection (station catalog)
 *   msc-geomet.climate_daily       -> climate-daily collection (daily obs by station+date range)
 *   msc-geomet.hydrometric_realtime -> hydrometric-realtime collection (river/lake level+flow)
 *   msc-geomet.aqhi_observations   -> aqhi-observations-realtime collection (Air Quality Health Index)
 */
export class MscGeometAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'msc-geomet', baseUrl: GEOMET_BASE, maxResponseBytes: 1_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'msc-geomet.climate_stations': {
        const qs = new URLSearchParams({ f: 'json' });
        const limit = this.clampLimit(params.limit, 20, 100);
        qs.set('limit', String(limit));
        if (params.province !== undefined) {
          const province = String(params.province).trim().toUpperCase();
          if (!PROV_TERR_CODES.has(province)) {
            throw this.invalidInput(
              req.toolId,
              `province must be one of: ${[...PROV_TERR_CODES].join(', ')}`,
            );
          }
          qs.set('PROV_STATE_TERR_CODE', province);
        }
        if (params.bbox !== undefined) {
          qs.set('bbox', String(params.bbox));
        }
        return {
          url: `${GEOMET_BASE}/collections/climate-stations/items?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/geo+json' },
        };
      }

      case 'msc-geomet.climate_daily': {
        const climateIdentifier = String(params.climate_identifier || '').trim();
        if (!climateIdentifier) {
          throw this.invalidInput(req.toolId, 'climate_identifier is required');
        }
        const qs = new URLSearchParams({ f: 'json' });
        qs.set('CLIMATE_IDENTIFIER', climateIdentifier);
        const limit = this.clampLimit(params.limit, 30, 366);
        qs.set('limit', String(limit));
        const startDate = params.start_date !== undefined ? String(params.start_date) : undefined;
        const endDate = params.end_date !== undefined ? String(params.end_date) : undefined;
        if (startDate !== undefined || endDate !== undefined) {
          if (!startDate || !DATE_RE.test(startDate)) {
            throw this.invalidInput(req.toolId, 'start_date must be YYYY-MM-DD');
          }
          if (!endDate || !DATE_RE.test(endDate)) {
            throw this.invalidInput(req.toolId, 'end_date must be YYYY-MM-DD');
          }
          qs.set('datetime', `${startDate}/${endDate}`);
        }
        return {
          url: `${GEOMET_BASE}/collections/climate-daily/items?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/geo+json' },
        };
      }

      case 'msc-geomet.hydrometric_realtime': {
        const stationNumber = String(params.station_number || '').trim();
        if (!stationNumber) {
          throw this.invalidInput(req.toolId, 'station_number is required');
        }
        const qs = new URLSearchParams({ f: 'json' });
        qs.set('STATION_NUMBER', stationNumber);
        const limit = this.clampLimit(params.limit, 20, 288);
        qs.set('limit', String(limit));
        qs.set('sortby', '-DATETIME');
        return {
          url: `${GEOMET_BASE}/collections/hydrometric-realtime/items?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/geo+json' },
        };
      }

      case 'msc-geomet.aqhi_observations': {
        const qs = new URLSearchParams({ f: 'json' });
        const limit = this.clampLimit(params.limit, 20, 50);
        qs.set('limit', String(limit));
        if (params.location_id !== undefined) {
          qs.set('location_id', String(params.location_id).trim());
        } else {
          qs.set('latest', 'true');
        }
        return {
          url: `${GEOMET_BASE}/collections/aqhi-observations-realtime/items?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/geo+json' },
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
    switch (req.toolId) {
      case 'msc-geomet.climate_stations': {
        const body = raw.body as GeoJsonFeatureCollection<ClimateStationProperties>;
        return {
          count: body.numberReturned ?? body.features.length,
          stations: body.features.map((f) => ({
            climate_identifier: f.properties.CLIMATE_IDENTIFIER,
            station_name: f.properties.STATION_NAME,
            province: f.properties.PROV_STATE_TERR_CODE,
            province_name: f.properties.ENG_PROV_NAME,
            wmo_identifier: f.properties.WMO_IDENTIFIER,
            elevation_m: f.properties.ELEVATION,
            coordinates: f.geometry?.coordinates ?? null,
            daily_record_range: {
              first: f.properties.DLY_FIRST_DATE,
              last: f.properties.DLY_LAST_DATE,
            },
            hourly_record_range: {
              first: f.properties.HLY_FIRST_DATE,
              last: f.properties.HLY_LAST_DATE,
            },
            has_hourly_data: f.properties.HAS_HOURLY_DATA === 'Y',
            has_normals_data: f.properties.HAS_NORMALS_DATA === 'Y',
          })),
        };
      }

      case 'msc-geomet.climate_daily': {
        const body = raw.body as GeoJsonFeatureCollection<ClimateDailyProperties>;
        return {
          climate_identifier: (req.params as Record<string, unknown>).climate_identifier,
          count: body.numberReturned ?? body.features.length,
          observations: body.features.map((f) => ({
            date: f.properties.LOCAL_DATE,
            station_name: f.properties.STATION_NAME,
            province: f.properties.PROVINCE_CODE,
            mean_temperature_c: f.properties.MEAN_TEMPERATURE,
            min_temperature_c: f.properties.MIN_TEMPERATURE,
            max_temperature_c: f.properties.MAX_TEMPERATURE,
            total_precipitation_mm: f.properties.TOTAL_PRECIPITATION,
            total_rain_mm: f.properties.TOTAL_RAIN,
            total_snow_cm: f.properties.TOTAL_SNOW,
            snow_on_ground_cm: f.properties.SNOW_ON_GROUND,
            max_gust_speed_kmh: f.properties.SPEED_MAX_GUST,
            max_gust_direction: f.properties.DIRECTION_MAX_GUST,
            heating_degree_days: f.properties.HEATING_DEGREE_DAYS,
            cooling_degree_days: f.properties.COOLING_DEGREE_DAYS,
          })),
        };
      }

      case 'msc-geomet.hydrometric_realtime': {
        const body = raw.body as GeoJsonFeatureCollection<HydrometricRealtimeProperties>;
        return {
          station_number: (req.params as Record<string, unknown>).station_number,
          count: body.numberReturned ?? body.features.length,
          readings: body.features.map((f) => ({
            station_name: f.properties.STATION_NAME,
            province: f.properties.PROV_TERR_STATE_LOC,
            datetime_utc: f.properties.DATETIME,
            datetime_local: f.properties.DATETIME_LST,
            water_level_m: f.properties.LEVEL,
            level_symbol: f.properties.LEVEL_SYMBOL_EN,
            discharge_m3s: f.properties.DISCHARGE,
            discharge_symbol: f.properties.DISCHARGE_SYMBOL_EN,
          })),
        };
      }

      case 'msc-geomet.aqhi_observations': {
        const body = raw.body as GeoJsonFeatureCollection<AqhiObservationProperties>;
        return {
          count: body.numberReturned ?? body.features.length,
          observations: body.features.map((f) => ({
            location_id: f.properties.location_id,
            location_name: f.properties.location_name_en,
            observation_datetime: f.properties.observation_datetime,
            observation_datetime_text: f.properties.observation_datetime_text_en,
            aqhi: f.properties.aqhi,
            observation_type: f.properties.observation_type,
            is_latest: f.properties.latest,
            special_notes: f.properties.special_notes_en || null,
            coordinates: f.geometry?.coordinates ?? null,
          })),
        };
      }

      default:
        return raw.body;
    }
  }

  private clampLimit(value: unknown, fallback: number, max: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(Math.floor(n), max);
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}
