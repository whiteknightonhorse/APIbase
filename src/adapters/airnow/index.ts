import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * AirNow EPA adapter (UC-397).
 * US AQI observations + forecasts. Free with API key. US only (50 states + territories).
 * https://docs.airnowapi.org
 */
export class AirNowAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'airnow', baseUrl: 'https://www.airnowapi.org' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'airnow.current_zip': {
        const qs = new URLSearchParams({
          format: 'application/json',
          zipCode: String(p.zip),
          distance: String(p.distance ?? 25),
          API_KEY: this.apiKey,
        });
        return {
          url: `${this.baseUrl}/aq/observation/zipCode/current/?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'airnow.current_latlng': {
        const qs = new URLSearchParams({
          format: 'application/json',
          latitude: String(p.lat),
          longitude: String(p.lng),
          distance: String(p.distance ?? 25),
          API_KEY: this.apiKey,
        });
        return {
          url: `${this.baseUrl}/aq/observation/latLong/current/?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'airnow.forecast_zip': {
        const qs = new URLSearchParams({
          format: 'application/json',
          zipCode: String(p.zip),
          distance: String(p.distance ?? 25),
          API_KEY: this.apiKey,
        });
        if (p.date) qs.set('date', String(p.date));
        return {
          url: `${this.baseUrl}/aq/forecast/zipCode/?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'airnow.forecast_latlng': {
        const qs = new URLSearchParams({
          format: 'application/json',
          latitude: String(p.lat),
          longitude: String(p.lng),
          distance: String(p.distance ?? 25),
          API_KEY: this.apiKey,
        });
        if (p.date) qs.set('date', String(p.date));
        return {
          url: `${this.baseUrl}/aq/forecast/latLong/?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
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

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const list = (raw.body as Array<Record<string, unknown>>) ?? [];
    return {
      observations: list.map((o) => ({
        date: o.DateObserved,
        hour: o.HourObserved,
        timezone: o.LocalTimeZone,
        location: {
          reporting_area: o.ReportingArea,
          state: o.StateCode,
          lat: o.Latitude,
          lng: o.Longitude,
        },
        parameter: o.ParameterName,
        aqi: o.AQI,
        category: ((o.Category as Record<string, unknown>) ?? {}).Name,
      })),
      count: list.length,
    };
  }
}
