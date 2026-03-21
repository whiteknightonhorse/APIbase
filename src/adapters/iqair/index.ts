import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class IqairAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
    this.apiKey = apiKey;
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'airquality.city': {
        const city = encodeURIComponent(String(params.city ?? ''));
        const state = encodeURIComponent(String(params.state ?? ''));
        const country = encodeURIComponent(String(params.country ?? ''));
        return {
          url: `http://api.airvisual.com/v2/city?city=${city}&state=${state}&country=${country}&key=${this.apiKey}`,
          method: 'GET',
          headers: {},
        };
      }

      case 'airquality.nearest': {
        const lat = params.lat ?? 0;
        const lon = params.lon ?? 0;
        return {
          url: `http://api.airvisual.com/v2/nearest_city?lat=${lat}&lon=${lon}&key=${this.apiKey}`,
          method: 'GET',
          headers: {},
        };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.status !== 'success' || !body?.data) {
      return {
        ...raw,
        status: raw.status >= 200 && raw.status < 300 ? 502 : raw.status,
        body: { error: body?.data?.message ?? 'IQAir request failed' },
      };
    }

    const d = body.data;
    const pollution = d.current?.pollution ?? {};
    const weather = d.current?.weather ?? {};

    const pollutantMap: Record<string, string> = {
      p2: 'PM2.5',
      p1: 'PM10',
      o3: 'O3',
      n2: 'NO2',
      s2: 'SO2',
      co: 'CO',
    };

    const result: Record<string, unknown> = {
      city: d.city,
      state: d.state,
      country: d.country,
      coordinates: d.location?.coordinates
        ? { lon: d.location.coordinates[0], lat: d.location.coordinates[1] }
        : null,
      air_quality: {
        aqi_us: pollution.aqius,
        aqi_cn: pollution.aqicn,
        dominant_pollutant_us: pollutantMap[pollution.mainus] ?? pollution.mainus,
        dominant_pollutant_cn: pollutantMap[pollution.maincn] ?? pollution.maincn,
        timestamp: pollution.ts,
      },
      weather: {
        temperature_c: weather.tp,
        humidity_pct: weather.hu,
        pressure_hpa: weather.pr,
        wind_speed_ms: weather.ws,
        wind_direction_deg: weather.wd,
        icon: weather.ic,
        timestamp: weather.ts,
      },
    };

    return { ...raw, body: result };
  }
}
