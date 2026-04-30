import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * US Energy Information Administration adapter (UC-407).
 * Authoritative US energy data (electricity, petroleum, natural gas, total energy).
 * Free with API key (5,000 req/hr). US Government public domain.
 */
export class EiaAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'eia', baseUrl: 'https://api.eia.gov', maxResponseBytes: 2_000_000 });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    const length = Math.max(1, Math.min(500, Number(p.length ?? 24)));

    const baseQs = () => {
      const qs = new URLSearchParams();
      qs.set('api_key', this.apiKey);
      qs.set('frequency', String(p.frequency ?? 'monthly'));
      qs.set('length', String(length));
      if (p.state) qs.append('facets[stateid][]', String(p.state).toUpperCase());
      if (p.start) qs.set('start', String(p.start));
      if (p.end) qs.set('end', String(p.end));
      return qs;
    };

    switch (req.toolId) {
      case 'eia.electricity_retail': {
        const qs = baseQs();
        qs.append('data[]', 'price');
        qs.append('data[]', 'sales');
        qs.append('data[]', 'revenue');
        qs.append('sort[0][column]', 'period');
        qs.append('sort[0][direction]', 'desc');
        return {
          url: `${this.baseUrl}/v2/electricity/retail-sales/data/?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'eia.petroleum_spot': {
        const qs = baseQs();
        qs.set('frequency', String(p.frequency ?? 'daily'));
        qs.append('data[]', 'value');
        if (p.product) qs.append('facets[product][]', String(p.product));
        qs.append('sort[0][column]', 'period');
        qs.append('sort[0][direction]', 'desc');
        return {
          url: `${this.baseUrl}/v2/petroleum/pri/spt/data/?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'eia.natural_gas': {
        const qs = baseQs();
        qs.append('data[]', 'value');
        qs.append('sort[0][column]', 'period');
        qs.append('sort[0][direction]', 'desc');
        return {
          url: `${this.baseUrl}/v2/natural-gas/pri/sum/data/?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'eia.series': {
        // Direct series-id fetch
        const qs = new URLSearchParams();
        qs.set('api_key', this.apiKey);
        qs.set('frequency', String(p.frequency ?? 'monthly'));
        qs.set('length', String(length));
        qs.append('data[]', 'value');
        qs.append('facets[seriesId][]', String(p.series_id));
        return {
          url: `${this.baseUrl}/v2/total-energy/data/?${qs.toString()}`,
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
    const body = raw.body as Record<string, unknown>;
    const response = (body.response as Record<string, unknown>) ?? {};
    const data = (response.data as Array<Record<string, unknown>>) ?? [];
    return {
      total: response.total,
      frequency: response.frequency,
      description: response.description,
      data: data.slice(0, 500),
    };
  }
}
