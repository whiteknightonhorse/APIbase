import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { SunriseSunsetApiResponse, SunriseSunsetDayResult } from './types';

const BASE_URL = 'https://api.sunrisesunset.io';

export class SunriseSunsetAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'sunrisesunset', baseUrl: BASE_URL });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const lat = p.lat as number;
    const lng = p.lng as number;

    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
    });

    if (p.timezone) params.set('timezone', String(p.timezone));
    if (p.time_format !== undefined) params.set('time_format', String(p.time_format));

    switch (req.toolId) {
      case 'sunrisesunset.daily':
      case 'sunrisesunset.moon_phase':
      case 'sunrisesunset.sun_position': {
        const date = p.date ? String(p.date) : 'today';
        params.set('date', date);
        break;
      }
      case 'sunrisesunset.range': {
        params.set('date_start', String(p.date_start));
        params.set('date_end', String(p.date_end));
        break;
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

    return {
      url: `${BASE_URL}/json?${params.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as SunriseSunsetApiResponse;

    if (body.status !== 'OK' || !body.results) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: body.error ?? 'Request failed',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    switch (req.toolId) {
      case 'sunrisesunset.daily':
        return this.parseDailyResult(body.results as SunriseSunsetDayResult);
      case 'sunrisesunset.range':
        return this.parseRangeResult(body.results as SunriseSunsetDayResult[]);
      case 'sunrisesunset.moon_phase':
        return this.parseMoonResult(body.results as SunriseSunsetDayResult);
      case 'sunrisesunset.sun_position':
        return this.parseSunPositionResult(body.results as SunriseSunsetDayResult);
      default:
        return body.results;
    }
  }

  private parseDailyResult(r: SunriseSunsetDayResult) {
    return {
      date: r.date,
      timezone: r.timezone,
      utc_offset: r.utc_offset,
      sunrise: r.sunrise,
      sunset: r.sunset,
      dawn: r.dawn,
      dusk: r.dusk,
      first_light: r.first_light,
      last_light: r.last_light,
      solar_noon: r.solar_noon,
      golden_hour: r.golden_hour,
      day_length: r.day_length,
      nautical_twilight_begin: r.nautical_twilight_begin,
      nautical_twilight_end: r.nautical_twilight_end,
      sun_altitude: r.sun_altitude,
      sun_azimuth: r.sun_azimuth,
      sunrise_azimuth: r.sunrise_azimuth,
      sunset_azimuth: r.sunset_azimuth,
      moonrise: r.moonrise,
      moonset: r.moonset,
      moon_phase: r.moon_phase,
      moon_illumination: r.moon_illumination,
      moon_phase_value: r.moon_phase_value,
      moon_always_up: r.moon_always_up,
      moon_always_down: r.moon_always_down,
      elevation: r.elevation,
    };
  }

  private parseRangeResult(results: SunriseSunsetDayResult[]) {
    const days = Array.isArray(results) ? results : [results];
    return {
      total_days: days.length,
      timezone: days[0]?.timezone ?? '',
      utc_offset: days[0]?.utc_offset ?? 0,
      days: days.map((r) => ({
        date: r.date,
        sunrise: r.sunrise,
        sunset: r.sunset,
        solar_noon: r.solar_noon,
        golden_hour: r.golden_hour,
        day_length: r.day_length,
        moon_phase: r.moon_phase,
        moon_illumination: r.moon_illumination,
        moon_always_up: r.moon_always_up,
        moon_always_down: r.moon_always_down,
      })),
    };
  }

  private parseMoonResult(r: SunriseSunsetDayResult) {
    return {
      date: r.date,
      timezone: r.timezone,
      moonrise: r.moonrise,
      moonset: r.moonset,
      moon_phase: r.moon_phase,
      moon_phase_value: r.moon_phase_value,
      moon_illumination: r.moon_illumination,
      moon_always_up: r.moon_always_up,
      moon_always_down: r.moon_always_down,
    };
  }

  private parseSunPositionResult(r: SunriseSunsetDayResult) {
    return {
      date: r.date,
      timezone: r.timezone,
      sun_altitude: r.sun_altitude,
      sun_azimuth: r.sun_azimuth,
      sunrise: r.sunrise,
      sunrise_azimuth: r.sunrise_azimuth,
      sunset: r.sunset,
      sunset_azimuth: r.sunset_azimuth,
      solar_noon: r.solar_noon,
      golden_hour: r.golden_hour,
      day_length: r.day_length,
      dawn: r.dawn,
      dusk: r.dusk,
    };
  }
}
