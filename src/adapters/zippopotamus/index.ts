import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { ZipResponse, PostalLookupOutput } from './types';

/**
 * Zippopotam.us adapter (UC-250).
 *
 * Supported tools:
 *   postal.lookup → GET /{country}/{postal_code}
 *
 * Auth: None. Free, unlimited, 60+ countries.
 */
export class ZippopotamusAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'zippopotamus',
      baseUrl: 'https://api.zippopotam.us',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'postal.lookup': {
        const country = encodeURIComponent(String(params.country_code ?? 'us').toLowerCase());
        const code = encodeURIComponent(String(params.postal_code ?? ''));
        return {
          url: `${this.baseUrl}/${country}/${code}`,
          method: 'GET',
          headers: {},
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
    const body = raw.body as unknown as ZipResponse;
    const params = req.params as Record<string, unknown>;

    if (!body || !body.places) {
      return {
        country: '',
        country_code: String(params.country_code ?? ''),
        postal_code: String(params.postal_code ?? ''),
        places: [],
        total: 0,
      } satisfies PostalLookupOutput;
    }

    return {
      country: body.country ?? '',
      country_code: body['country abbreviation'] ?? '',
      postal_code: body['post code'] ?? '',
      places: (body.places ?? []).map((p) => ({
        name: p['place name'] ?? '',
        state: p.state ?? '',
        state_code: p['state abbreviation'] ?? '',
        lat: parseFloat(p.latitude) || 0,
        lon: parseFloat(p.longitude) || 0,
      })),
      total: (body.places ?? []).length,
    } satisfies PostalLookupOutput;
  }
}
