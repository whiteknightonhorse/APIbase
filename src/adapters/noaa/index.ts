import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_BACKOFF_BASE_MS,
} from '../../types/provider';
import { logger } from '../../config/logger';
import type {
  NwsPointsProperties,
  NwsForecastPeriod,
  NwsStationFeature,
  NwsObservationProps,
  NoaaForecastOutput,
  NoaaHourlyOutput,
  NoaaObservationOutput,
  ForecastPeriod,
  HourlyPeriod,
} from './types';

const NWS_BASE = 'https://api.weather.gov';
const NWS_HEADERS: Record<string, string> = {
  'User-Agent': '(apibase.pro, support@apibase.pro)',
  Accept: 'application/geo+json',
};

/**
 * NOAA / NWS Weather adapter (UC-324).
 *
 * US-only. No API key — User-Agent header only.
 * All 3 tools require a 2-step NWS lookup:
 *   Step 1: GET /points/{lat},{lon} → metadata + downstream URLs
 *   Step 2: GET the relevant downstream URL (forecast, hourly, or stations+observation)
 *
 * Overrides call() entirely to perform sequential async fetches.
 */
export class NoaaAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'noaa',
      baseUrl: NWS_BASE,
      timeoutMs: 12_000,
    });
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = req.params as Record<string, unknown>;
    const lat = Number(params.latitude);
    const lon = Number(params.longitude);

    if (lat < 24 || lat > 50 || lon < -125 || lon > -66) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 400,
        message: 'NOAA only covers the contiguous US (lat 24–50, lon −125 to −66)',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    // Step 1 — /points lookup (shared by all tools)
    const coordStr = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const pointsData = await this.fetchJson<{ properties: NwsPointsProperties }>(
      `${NWS_BASE}/points/${coordStr}`,
      req,
      start,
    );
    const props = pointsData.properties;
    const locationName = `${props.relativeLocation.properties.city}, ${props.relativeLocation.properties.state}`;

    let body: unknown;

    switch (req.toolId) {
      case 'noaa.forecast': {
        const data = await this.fetchJson<{
          properties: { generatedAt: string; periods: NwsForecastPeriod[] };
        }>(props.forecast, req, start);
        body = this.parseForecast(data.properties, locationName, props.timeZone);
        break;
      }

      case 'noaa.hourly': {
        const data = await this.fetchJson<{
          properties: { generatedAt: string; periods: NwsForecastPeriod[] };
        }>(props.forecastHourly, req, start);
        body = this.parseHourly(data.properties, locationName, props.timeZone);
        break;
      }

      case 'noaa.observation': {
        const stationsData = await this.fetchJson<{ features: NwsStationFeature[] }>(
          `${props.observationStations}?limit=1`,
          req,
          start,
        );
        const station = stationsData.features[0];
        if (!station) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'No observation stations found for this location',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: Math.round(performance.now() - start),
          };
        }
        const stationId = encodeURIComponent(station.properties.stationIdentifier);
        const obsData = await this.fetchJson<{ properties: NwsObservationProps }>(
          `${NWS_BASE}/stations/${stationId}/observations/latest`,
          req,
          start,
        );
        body = this.parseObservation(obsData.properties, station.properties);
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

    const durationMs = Math.round(performance.now() - start);
    logger.info(
      { provider: this.provider, tool_id: req.toolId, duration_ms: durationMs },
      'NOAA 2-step call completed',
    );

    return {
      status: 200,
      headers: {},
      body,
      durationMs,
      byteLength: Buffer.byteLength(JSON.stringify(body), 'utf8'),
    };
  }

  // Required by abstract base — never invoked (call() is overridden)
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('NoaaAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  // ---------------------------------------------------------------------------
  // Private fetch helper with retry/timeout/size-guard
  // ---------------------------------------------------------------------------

  private async fetchJson<T>(url: string, req: ProviderRequest, start: number): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
      }

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: NWS_HEADERS,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.status === 429) {
          throw {
            code: ProviderErrorCode.RATE_LIMIT,
            httpStatus: 429,
            message: 'NWS rate limit exceeded',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: Math.round(performance.now() - start),
          };
        }

        if (response.status >= 500) {
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `NWS returned ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: Math.round(performance.now() - start),
          };
        }

        if (response.status >= 400) {
          const detail = await response.text().catch(() => '');
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: `NWS error ${response.status}: ${detail.slice(0, 200)}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: Math.round(performance.now() - start),
          };
        }

        const bodyText = await response.text();
        if (Buffer.byteLength(bodyText, 'utf8') > this.maxResponseBytes) {
          throw {
            code: ProviderErrorCode.RESPONSE_TOO_LARGE,
            httpStatus: 502,
            message: 'NWS response exceeded 1MB',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: Math.round(performance.now() - start),
          };
        }

        return JSON.parse(bodyText) as T;
      } catch (error) {
        lastError = error;
        const e = error as { code?: string };
        // Only retry on timeout or unavailable
        if (e.code !== ProviderErrorCode.TIMEOUT && e.code !== ProviderErrorCode.UNAVAILABLE) {
          // Check if it's a fetch-level timeout (AbortError / TimeoutError)
          const fetchErr = error as { name?: string };
          if (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError') {
            lastError = {
              code: ProviderErrorCode.TIMEOUT,
              httpStatus: 504,
              message: `NWS call timed out after ${this.timeoutMs}ms`,
              provider: this.provider,
              toolId: req.toolId,
              durationMs: Math.round(performance.now() - start),
            };
            continue; // retry
          }
          throw error; // non-retryable
        }
      }
    }

    throw lastError;
  }

  // ---------------------------------------------------------------------------
  // Parsers
  // ---------------------------------------------------------------------------

  private parseForecast(
    props: { generatedAt: string; periods: NwsForecastPeriod[] },
    location: string,
    timezone: string,
  ): NoaaForecastOutput {
    const periods: ForecastPeriod[] = props.periods.slice(0, 14).map((p) => ({
      period: p.name,
      start: p.startTime,
      is_daytime: p.isDaytime,
      temp_f: p.temperature,
      temp_trend: p.temperatureTrend ?? null,
      precip_chance_pct: p.probabilityOfPrecipitation?.value ?? null,
      wind: `${p.windSpeed} ${p.windDirection}`.trim(),
      short: p.shortForecast,
      detail: p.detailedForecast ?? '',
    }));
    return { location, timezone, generated_at: props.generatedAt, periods };
  }

  private parseHourly(
    props: { generatedAt: string; periods: NwsForecastPeriod[] },
    location: string,
    timezone: string,
  ): NoaaHourlyOutput {
    const periods: HourlyPeriod[] = props.periods.slice(0, 48).map((p) => ({
      start: p.startTime,
      temp_f: p.temperature,
      precip_chance_pct: p.probabilityOfPrecipitation?.value ?? null,
      wind: `${p.windSpeed} ${p.windDirection}`.trim(),
      short: p.shortForecast,
    }));
    return { location, timezone, periods };
  }

  private parseObservation(
    p: NwsObservationProps,
    station: { stationIdentifier: string; name: string },
  ): NoaaObservationOutput {
    const tempC = p.temperature.value;
    return {
      station_id: station.stationIdentifier,
      station_name: station.name,
      observed_at: p.timestamp,
      description: p.textDescription,
      temp_c: tempC,
      temp_f: tempC !== null ? Math.round((tempC * 9) / 5 + 32) : null,
      dewpoint_c: p.dewpoint.value,
      humidity_pct: p.relativeHumidity.value !== null ? Math.round(p.relativeHumidity.value) : null,
      wind_dir_deg: p.windDirection.value,
      wind_speed_kmh: p.windSpeed.value !== null ? Math.round(p.windSpeed.value * 3.6) : null,
      wind_gust_kmh: p.windGust.value !== null ? Math.round(p.windGust.value * 3.6) : null,
      pressure_pa: p.barometricPressure.value ?? p.seaLevelPressure.value,
      visibility_m: p.visibility.value,
      heat_index_c: p.heatIndex.value,
      wind_chill_c: p.windChill.value,
      precip_last_hour_mm:
        p.precipitationLastHour.value !== null
          ? Math.round(p.precipitationLastHour.value * 1000)
          : null,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
