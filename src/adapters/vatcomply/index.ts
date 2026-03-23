import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class VatcomplyAdapter extends BaseAdapter {
  constructor() {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://api.vatcomply.com';

    switch (req.toolId) {
      case 'vatcomply.validate': {
        const vatNumber = String(params.vat_number ?? '');
        return { url: `${base}/vat?vat_number=${encodeURIComponent(vatNumber)}`, method: 'GET', headers: {} };
      }

      case 'vatcomply.rates': {
        const qs = new URLSearchParams();
        if (params.country_code) qs.set('country_code', String(params.country_code));
        return { url: `${base}/rates${qs.toString() ? '?' + qs : ''}`, method: 'GET', headers: {} };
      }

      case 'vatcomply.currencies': {
        return { url: `${base}/currencies`, method: 'GET', headers: {} };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (req.toolId === 'vatcomply.validate') {
      return {
        ...raw,
        body: {
          valid: body.valid,
          vat_number: body.vat_number,
          country_code: body.country_code,
          company_name: body.name !== '---' ? body.name : null,
          company_address: body.address !== '---' ? body.address : null,
        },
      };
    }

    if (req.toolId === 'vatcomply.rates') {
      if (body.rates && typeof body.rates === 'object' && !Array.isArray(body.rates)) {
        // Single country response — has standard_rate etc.
        const countryCode = Object.keys(body.rates)[0];
        if (countryCode && body.rates[countryCode]?.standard_rate !== undefined) {
          const r = body.rates[countryCode];
          return {
            ...raw,
            body: {
              country: countryCode,
              standard_rate: r.standard_rate,
              reduced_rates: r.reduced_rates,
              super_reduced_rate: r.super_reduced_rate,
              parking_rate: r.parking_rate,
              currency: body.base,
              date: body.date,
            },
          };
        }
      }
      // All countries — return exchange rates
      return { ...raw, body: { date: body.date, base: body.base, rates: body.rates } };
    }

    if (req.toolId === 'vatcomply.currencies') {
      const currencies = Object.entries(body).map(([code, info]) => {
        const c = info as Record<string, unknown>;
        return {
          code,
          name: c.name,
          symbol: c.currency_symbol,
          decimal_places: c.decimal_places,
        };
      });
      return { ...raw, body: { currencies, count: currencies.length } };
    }

    return raw;
  }
}
