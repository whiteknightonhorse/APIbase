import { BaseNormalizer } from './base.normalizer';
import type { ProviderRawResponse, ProviderNormalizedResponse } from '../types/provider';
import type {
  OwmCurrentResponse,
  OwmForecastResponse,
  OwmForecastEntry,
  OwmWeatherCondition,
} from '../adapters/openweathermap/types';

/**
 * Weather normalizer (UC-005, §10.2 Level 2, §12.147).
 *
 * Maps OpenWeatherMap responses → canonical APIbase weather model.
 * Invariant: agents always receive the same schema regardless of provider.
 */
export class WeatherNormalizer extends BaseNormalizer {
  constructor() {
    super('openweathermap');
  }

  protected normalize(raw: ProviderRawResponse, toolId: string): ProviderNormalizedResponse {
    switch (toolId) {
      case 'weather.get_current':
        return this.normalizeCurrent(raw.body as OwmCurrentResponse);
      case 'weather.get_forecast':
        return this.normalizeForecast(raw.body as OwmForecastResponse);
      default:
        throw new Error(`Unsupported tool: ${toolId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // weather.get_current
  // ---------------------------------------------------------------------------

  private normalizeCurrent(owm: OwmCurrentResponse): ProviderNormalizedResponse {
    const tzOffsetSec = owm.timezone;
    const weather = owm.weather[0];

    return {
      data: {
        provider: 'openweathermap',
        location: {
          lat: owm.coord.lat,
          lon: owm.coord.lon,
          city: owm.name,
          country: owm.sys.country,
          utc_offset: formatUtcOffset(tzOffsetSec),
        },
        current: {
          timestamp: unixToIso(owm.dt, tzOffsetSec),
          temperature_c: owm.main.temp,
          feels_like_c: owm.main.feels_like,
          condition: weather.description,
          condition_code: mapConditionCode(weather),
          icon: mapIcon(weather),
          humidity_pct: owm.main.humidity,
          pressure_hpa: owm.main.pressure,
          wind: {
            speed_ms: owm.wind.speed,
            speed_kmh: round2(owm.wind.speed * 3.6),
            direction_deg: owm.wind.deg,
            direction: degreesToCompass(owm.wind.deg),
            gust_ms: owm.wind.gust ?? null,
          },
          visibility_km: round2(owm.visibility / 1000),
          uv_index: null,
          cloud_cover_pct: owm.clouds.all,
          sunrise: unixToIso(owm.sys.sunrise, tzOffsetSec),
          sunset: unixToIso(owm.sys.sunset, tzOffsetSec),
        },
      },
      metadata: {
        provider: 'openweathermap',
        owm_weather_id: weather.id,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // weather.get_forecast (5-day/3-hour from /data/2.5/forecast)
  // ---------------------------------------------------------------------------

  private normalizeForecast(owm: OwmForecastResponse): ProviderNormalizedResponse {
    const tzOffsetSec = owm.city.timezone;
    const city = owm.city;

    const forecastHourly = owm.list.map((entry) => this.normalizeForecastEntry(entry, tzOffsetSec));
    const forecastDaily = aggregateDaily(owm.list, tzOffsetSec);

    return {
      data: {
        provider: 'openweathermap',
        location: {
          lat: city.coord.lat,
          lon: city.coord.lon,
          city: city.name,
          country: city.country,
          utc_offset: formatUtcOffset(tzOffsetSec),
        },
        forecast_hourly: forecastHourly,
        forecast_daily: forecastDaily,
      },
      metadata: {
        provider: 'openweathermap',
        forecast_entries: owm.list.length,
      },
    };
  }

  private normalizeForecastEntry(
    entry: OwmForecastEntry,
    tzOffsetSec: number,
  ): Record<string, unknown> {
    const weather = entry.weather[0];
    const precipMm = (entry.rain?.['3h'] ?? 0) + (entry.snow?.['3h'] ?? 0);

    return {
      timestamp: unixToIso(entry.dt, tzOffsetSec),
      temperature_c: entry.main.temp,
      feels_like_c: entry.main.feels_like,
      condition: weather.description,
      condition_code: mapConditionCode(weather),
      humidity_pct: entry.main.humidity,
      pressure_hpa: entry.main.pressure,
      wind_speed_ms: entry.wind.speed,
      precipitation_mm: round2(precipMm),
      cloud_cover_pct: entry.clouds.all,
      pop: entry.pop,
    };
  }
}

// ---------------------------------------------------------------------------
// Daily aggregation from 3-hourly entries
// ---------------------------------------------------------------------------

function aggregateDaily(
  entries: OwmForecastEntry[],
  tzOffsetSec: number,
): Record<string, unknown>[] {
  const dayMap = new Map<
    string,
    {
      temps: number[];
      humidities: number[];
      precip: number;
      conditions: OwmWeatherCondition[];
    }
  >();

  for (const entry of entries) {
    const date = unixToDateStr(entry.dt, tzOffsetSec);
    let day = dayMap.get(date);
    if (!day) {
      day = { temps: [], humidities: [], precip: 0, conditions: [] };
      dayMap.set(date, day);
    }
    day.temps.push(entry.main.temp);
    day.humidities.push(entry.main.humidity);
    day.precip += (entry.rain?.['3h'] ?? 0) + (entry.snow?.['3h'] ?? 0);
    day.conditions.push(entry.weather[0]);
  }

  const result: Record<string, unknown>[] = [];
  for (const [date, day] of dayMap) {
    const dominantCondition = findDominantCondition(day.conditions);
    result.push({
      date,
      temp_min_c: round2(Math.min(...day.temps)),
      temp_max_c: round2(Math.max(...day.temps)),
      condition: dominantCondition.description,
      condition_code: mapConditionCode(dominantCondition),
      precipitation_mm: round2(day.precip),
      humidity_pct: Math.round(day.humidities.reduce((a, b) => a + b, 0) / day.humidities.length),
    });
  }

  return result;
}

function findDominantCondition(conditions: OwmWeatherCondition[]): OwmWeatherCondition {
  const counts = new Map<number, { count: number; condition: OwmWeatherCondition }>();
  for (const c of conditions) {
    const existing = counts.get(c.id);
    if (existing) {
      existing.count++;
    } else {
      counts.set(c.id, { count: 1, condition: c });
    }
  }
  let best = conditions[0];
  let bestCount = 0;
  for (const { count, condition } of counts.values()) {
    if (count > bestCount) {
      bestCount = count;
      best = condition;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function unixToIso(unix: number, tzOffsetSec: number): string {
  const ms = (unix + tzOffsetSec) * 1000;
  const d = new Date(ms);
  const iso = d.toISOString().replace('Z', '');
  return iso.slice(0, 19) + formatUtcOffset(tzOffsetSec);
}

function unixToDateStr(unix: number, tzOffsetSec: number): string {
  const ms = (unix + tzOffsetSec) * 1000;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

function formatUtcOffset(tzOffsetSec: number): string {
  const sign = tzOffsetSec >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffsetSec);
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Wind direction compass (16-point)
// ---------------------------------------------------------------------------

const COMPASS_POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

function degreesToCompass(deg: number): string {
  const index = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_POINTS[index];
}

// ---------------------------------------------------------------------------
// Condition code mapping (OWM weather ID → canonical code)
// ---------------------------------------------------------------------------

function mapConditionCode(weather: OwmWeatherCondition): string {
  const id = weather.id;

  if (id >= 200 && id < 300) return 'thunderstorm';
  if (id >= 300 && id < 400) return 'drizzle';
  if (id >= 500 && id < 600) return 'rain';
  if (id >= 600 && id < 700) return 'snow';
  if (id === 701) return 'mist';
  if (id === 711) return 'smoke';
  if (id === 721) return 'haze';
  if (id === 731 || id === 761) return 'dust';
  if (id === 741) return 'fog';
  if (id === 751) return 'sand';
  if (id === 762) return 'volcanic_ash';
  if (id === 771) return 'squall';
  if (id === 781) return 'tornado';
  if (id === 800) return 'clear';
  if (id === 801) return 'few_clouds';
  if (id === 802) return 'partly_cloudy';
  if (id === 803) return 'mostly_cloudy';
  if (id === 804) return 'overcast';

  return 'unknown';
}

function mapIcon(weather: OwmWeatherCondition): string {
  const code = mapConditionCode(weather);
  const isDay = weather.icon.endsWith('d');
  if (code === 'clear') return isDay ? 'clear_day' : 'clear_night';
  if (code === 'few_clouds' || code === 'partly_cloudy') {
    return isDay ? 'partly_cloudy_day' : 'partly_cloudy_night';
  }
  return code;
}

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
