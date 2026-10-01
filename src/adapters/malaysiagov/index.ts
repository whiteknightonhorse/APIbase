import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Malaysia data.gov.my Open API adapter (UC-798).
 *
 * Supported tools (read-only):
 *   malaysiagov.dataset          → GET /data-catalogue/ or /opendosm/
 *   malaysiagov.weather_forecast → GET /weather/forecast/
 *   malaysiagov.weather_warning  → GET /weather/warning/
 *   malaysiagov.earthquake       → GET /weather/warning/earthquake/
 *   malaysiagov.flood_warning    → GET /flood-warning/
 *
 * Auth: None (open access, rate-limited per IP upstream).
 * Responses are plain JSON arrays.
 */
export class MalaysiaGovAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'malaysiagov',
      baseUrl: 'https://api.data.gov.my',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const qs = new URLSearchParams();
    let path: string;

    switch (req.toolId) {
      case 'malaysiagov.dataset': {
        path = p.source === 'opendosm' ? '/opendosm/' : '/data-catalogue/';
        qs.set('id', String(p.id));
        if (p.filter) qs.set('filter', String(p.filter));
        if (p.contains) qs.set('contains', String(p.contains));
        if (p.date_start) qs.set('date_start', String(p.date_start));
        if (p.date_end) qs.set('date_end', String(p.date_end));
        if (p.sort) qs.set('sort', String(p.sort));
        break;
      }
      case 'malaysiagov.weather_forecast': {
        path = '/weather/forecast/';
        if (p.location_name)
          qs.set('contains', `${String(p.location_name)}@location__location_name`);
        if (p.date_start) qs.set('date_start', String(p.date_start));
        if (p.date_end) qs.set('date_end', String(p.date_end));
        qs.set('sort', '-date');
        break;
      }
      case 'malaysiagov.weather_warning':
        path = '/weather/warning/';
        break;
      case 'malaysiagov.earthquake':
        path = '/weather/warning/earthquake/';
        qs.set('sort', '-utcdatetime');
        break;
      case 'malaysiagov.flood_warning': {
        path = '/flood-warning/';
        if (p.state) qs.set('state', String(p.state));
        if (p.district) qs.set('district', String(p.district));
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

    qs.set('limit', String(p.limit ?? 20));

    return {
      url: `${this.baseUrl}${path}?${qs.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body;
    if (!Array.isArray(body)) {
      throw new Error('Invalid data.gov.my response — expected a JSON array');
    }
    return { count: body.length, data: body };
  }
}
