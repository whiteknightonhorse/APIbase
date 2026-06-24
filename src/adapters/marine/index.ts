import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { MarineApiResponse, MarineHourlyPoint } from './types';

const MARINE_BASE = 'https://marine-api.open-meteo.com/v1/marine';

/**
 * Open-Meteo Marine API adapter (UC-506).
 *
 * Tools: marine.forecast, marine.wave_conditions, marine.swell_forecast, marine.sea_temperature
 * Auth: None. License: CC BY 4.0 — free for commercial use.
 * Rate limits: None documented.
 */
export class MarineAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'marine', baseUrl: MARINE_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const lat = String(p.latitude ?? '');
    const lon = String(p.longitude ?? '');
    const days = Math.min(Math.max(Number(p.forecast_days) || 7, 1), 16);
    const tz = String(p.timezone || 'UTC');

    if (!lat || !lon) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'latitude and longitude are required',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    let variables: string;
    switch (req.toolId) {
      case 'marine.forecast':
        variables =
          'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature';
        break;
      case 'marine.wave_conditions':
        variables = 'wave_height,wave_direction,wave_period';
        break;
      case 'marine.swell_forecast':
        variables = 'swell_wave_height,swell_wave_direction,swell_wave_period';
        break;
      case 'marine.sea_temperature':
        variables = 'sea_surface_temperature';
        break;
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

    const url = `${MARINE_BASE}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&hourly=${variables}&forecast_days=${days}&timezone=${encodeURIComponent(tz)}`;
    return { url, method: 'GET', headers: { Accept: 'application/json' } };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as MarineApiResponse;
    const p = req.params as Record<string, unknown>;
    const h = body.hourly;
    const units = body.hourly_units;
    const times = h.time ?? [];

    const points: MarineHourlyPoint[] = times.map((t, i) => {
      const point: MarineHourlyPoint = { time: t };
      if (h.wave_height !== undefined) point.wave_height_m = h.wave_height[i] ?? null;
      if (h.wave_direction !== undefined) point.wave_direction_deg = h.wave_direction[i] ?? null;
      if (h.wave_period !== undefined) point.wave_period_s = h.wave_period[i] ?? null;
      if (h.swell_wave_height !== undefined)
        point.swell_wave_height_m = h.swell_wave_height[i] ?? null;
      if (h.swell_wave_direction !== undefined)
        point.swell_wave_direction_deg = h.swell_wave_direction[i] ?? null;
      if (h.swell_wave_period !== undefined)
        point.swell_wave_period_s = h.swell_wave_period[i] ?? null;
      if (h.sea_surface_temperature !== undefined)
        point.sea_surface_temperature_c = h.sea_surface_temperature[i] ?? null;
      return point;
    });

    const days = Math.min(Math.max(Number(p.forecast_days) || 7, 1), 16);

    return {
      latitude: body.latitude,
      longitude: body.longitude,
      timezone: body.timezone,
      timezone_abbreviation: body.timezone_abbreviation,
      forecast_days: days,
      units: {
        wave_height: units.wave_height ?? 'm',
        wave_direction: units.wave_direction ?? '°',
        wave_period: units.wave_period ?? 's',
        swell_wave_height: units.swell_wave_height ?? 'm',
        swell_wave_direction: units.swell_wave_direction ?? '°',
        swell_wave_period: units.swell_wave_period ?? 's',
        sea_surface_temperature: units.sea_surface_temperature ?? '°C',
      },
      hourly: points,
    };
  }
}
