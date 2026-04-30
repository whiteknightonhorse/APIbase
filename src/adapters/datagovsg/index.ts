import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Singapore data.gov.sg adapter (UC-412).
 * NEA (environment) + LTA (transport) real-time data, no auth.
 * Singapore Open Data Licence v1.0 — commercial reuse permitted.
 */
export class DataGovSgAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'datagovsg',
      baseUrl: 'https://api.data.gov.sg',
      maxResponseBytes: 2_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const dateQs = p.date ? `?date=${encodeURIComponent(String(p.date))}` : '';

    switch (req.toolId) {
      case 'sg.weather_forecast':
        return {
          url: `${this.baseUrl}/v1/environment/2-hour-weather-forecast${dateQs}`,
          method: 'GET',
          headers,
        };
      case 'sg.air_quality':
        return {
          url: `${this.baseUrl}/v1/environment/pm25${dateQs}`,
          method: 'GET',
          headers,
        };
      case 'sg.rainfall':
        return {
          url: `${this.baseUrl}/v1/environment/rainfall${dateQs}`,
          method: 'GET',
          headers,
        };
      case 'sg.taxi_availability':
        return {
          url: `${this.baseUrl}/v1/transport/taxi-availability`,
          method: 'GET',
          headers,
        };
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'sg.weather_forecast': {
        const items = (body.items as Array<Record<string, unknown>>) ?? [];
        const latest = items[items.length - 1] ?? items[0];
        if (!latest) return { forecasts: [] };
        const forecasts = (latest.forecasts as Array<Record<string, unknown>>) ?? [];
        return {
          update_timestamp: latest.update_timestamp,
          valid_period: latest.valid_period,
          area_count: forecasts.length,
          forecasts: forecasts.map((f) => ({ area: f.area, forecast: f.forecast })),
        };
      }
      case 'sg.air_quality': {
        const items = (body.items as Array<Record<string, unknown>>) ?? [];
        const latest = items[items.length - 1] ?? items[0];
        if (!latest) return { regions: {} };
        const readings = ((latest.readings as Record<string, unknown>) ?? {}) as Record<
          string,
          Record<string, number>
        >;
        return {
          timestamp: latest.timestamp,
          update_timestamp: latest.update_timestamp,
          pm25_ug_per_m3: readings.pm25_one_hourly ?? readings,
          regions_metadata: body.region_metadata,
        };
      }
      case 'sg.rainfall': {
        const items = (body.items as Array<Record<string, unknown>>) ?? [];
        const latest = items[items.length - 1] ?? items[0];
        if (!latest) return { stations: [] };
        const readings = ((latest.readings as Array<Record<string, unknown>>) ?? []) as Array<
          Record<string, unknown>
        >;
        const stations = (body.stations as Array<Record<string, unknown>>) ?? [];
        const stationMap = new Map<string, Record<string, unknown>>();
        for (const s of stations) stationMap.set(String(s.id), s);
        return {
          timestamp: latest.timestamp,
          stations: readings.map((r) => {
            const meta = stationMap.get(String(r.station_id));
            return {
              station_id: r.station_id,
              station_name: meta?.name,
              location: meta?.location,
              rainfall_mm: r.value,
            };
          }),
        };
      }
      case 'sg.taxi_availability': {
        // GeoJSON FeatureCollection — return zone-aggregated counts
        const features = (body.features as Array<Record<string, unknown>>) ?? [];
        const fc = features[0] ?? {};
        const props = (fc.properties as Record<string, unknown>) ?? {};
        const geom = (fc.geometry as Record<string, unknown>) ?? {};
        const coords = (geom.coordinates as Array<[number, number]>) ?? [];
        // Aggregate to 0.05° grid cells (~5km)
        const grid = new Map<string, number>();
        for (const [lon, lat] of coords) {
          const key = `${(Math.round(lat / 0.05) * 0.05).toFixed(2)},${(Math.round(lon / 0.05) * 0.05).toFixed(2)}`;
          grid.set(key, (grid.get(key) ?? 0) + 1);
        }
        const zones = [...grid.entries()]
          .map(([k, c]) => ({ center: k, taxi_count: c }))
          .sort((a, b) => b.taxi_count - a.taxi_count)
          .slice(0, 30);
        return {
          timestamp: props.timestamp,
          taxi_count: props.taxi_count ?? coords.length,
          api_info: props.api_info,
          top_zones: zones,
        };
      }
      default:
        return body;
    }
  }
}
