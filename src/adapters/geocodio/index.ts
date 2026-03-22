import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class GeocodioAdapter extends BaseAdapter {
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
      case 'geocodio.geocode': {
        const q = encodeURIComponent(String(params.address ?? ''));
        const limit = params.limit ?? 5;
        return {
          url: `https://api.geocod.io/v1.7/geocode?q=${q}&limit=${limit}&api_key=${this.apiKey}`,
          method: 'GET',
          headers: {},
        };
      }

      case 'geocodio.reverse': {
        const lat = params.lat ?? 0;
        const lon = params.lon ?? 0;
        const limit = params.limit ?? 5;
        return {
          url: `https://api.geocod.io/v1.7/reverse?q=${lat},${lon}&limit=${limit}&api_key=${this.apiKey}`,
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

    if (body?.error) {
      return {
        ...raw,
        status: 502,
        body: { error: body.error },
      };
    }

    const results = (body?.results ?? []).map((r: Record<string, unknown>) => {
      const ac = r.address_components as Record<string, unknown> | undefined;
      const loc = r.location as Record<string, unknown> | undefined;
      return {
        formatted_address: r.formatted_address,
        street_number: ac?.number,
        street: ac?.formatted_street,
        city: ac?.city,
        county: ac?.county,
        state: ac?.state,
        zip: ac?.zip,
        country: ac?.country,
        lat: loc?.lat,
        lon: loc?.lng,
        accuracy: r.accuracy,
        accuracy_type: r.accuracy_type,
        source: r.source,
      };
    });

    return {
      ...raw,
      body: {
        input: body?.input?.formatted_address ?? null,
        results,
        count: results.length,
      },
    };
  }
}
