import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  AfricaCountriesResponse,
  AfricaCountrySignalsResponse,
  AfricaFxRatesResponse,
  AfricaDataResponse,
  AfricaElectionsResponse,
} from './types';

/**
 * Africa API adapter (UC-546).
 * Pan-African economic data for all 54 African countries: macroeconomic signals,
 * African FX rates, historical indicators, elections. Bearer token auth.
 * Free plan: 1,000 req/month, 5 req/min. Sources: World Bank, IMF, UN, ILO.
 */
export class AfricaApiAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'africa', baseUrl: 'https://api.africa-api.com' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };

    let url: string;
    switch (req.toolId) {
      case 'africa.countries.list': {
        const qs = new URLSearchParams();
        if (p.region) qs.set('region', p.region as string);
        qs.set('per_page', '54');
        url = `${this.baseUrl}/v1/countries?${qs}`;
        break;
      }

      case 'africa.countries.signals': {
        const code = (p.country_code as string).toLowerCase();
        url = `${this.baseUrl}/v1/countries/${encodeURIComponent(code)}/signals`;
        break;
      }

      case 'africa.markets.fx_rates': {
        const qs = new URLSearchParams();
        if (p.country_code) qs.set('country_code', (p.country_code as string).toLowerCase());
        if (p.quote_currencies) qs.set('quote_currencies', p.quote_currencies as string);
        qs.set('limit', '60');
        url = `${this.baseUrl}/v1/markets/fx-rates?${qs}`;
        break;
      }

      case 'africa.data.indicator': {
        const qs = new URLSearchParams();
        qs.set('country_code', (p.country_code as string).toLowerCase());
        qs.set('metric_key', p.metric_key as string);
        if (p.start_year) qs.set('start_year', String(p.start_year));
        if (p.end_year) qs.set('end_year', String(p.end_year));
        if (!p.start_year && !p.end_year) qs.set('latest', 'true');
        qs.set('limit', String(p.limit ?? 20));
        url = `${this.baseUrl}/v1/data?${qs}`;
        break;
      }

      case 'africa.politics.elections': {
        const qs = new URLSearchParams();
        if (p.country_code) qs.set('country_code', (p.country_code as string).toLowerCase());
        if (p.status) qs.set('status', p.status as string);
        if (p.start_year) qs.set('start_year', String(p.start_year));
        if (p.end_year) qs.set('end_year', String(p.end_year));
        qs.set('limit', String(p.limit ?? 20));
        url = `${this.baseUrl}/v1/elections?${qs}`;
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

    return { url, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'africa.countries.list': {
        const body = raw.body as AfricaCountriesResponse;
        return {
          total: body.meta?.total ?? body.data?.length ?? 0,
          page: body.meta?.page ?? 1,
          countries: (body.data ?? []).map((c) => ({
            code: c.id,
            iso3: c.iso3,
            name: c.name,
            official_name: c.official_name,
            capital: c.capital,
            region: c.region,
            subregion: c.subregion,
            area_km2: c.area_km2,
            timezone: c.timezone,
            currencies: c.currencies,
            languages: c.languages,
            borders: c.borders,
          })),
        };
      }

      case 'africa.countries.signals': {
        const body = raw.body as AfricaCountrySignalsResponse;
        const { country, observations } = body.data ?? {};
        return {
          country,
          observations: (observations ?? []).map((o) => ({
            metric_key: o.metric_key,
            metric_name: o.metric_name,
            category: o.category,
            value: o.value,
            unit: o.unit,
            year: o.year,
            as_of: o.as_of_period ?? String(o.year),
            freshness: o.freshness,
            source: o.source,
          })),
          observation_count: observations?.length ?? 0,
        };
      }

      case 'africa.markets.fx_rates': {
        const body = raw.body as AfricaFxRatesResponse;
        return {
          base_currency: 'USD',
          rate_date: body.data?.[0]?.rate_date ?? null,
          rates: (body.data ?? []).map((r) => ({
            quote_currency: r.quote_currency,
            country_codes: r.country_codes,
            rate: r.rate,
            rate_date: r.rate_date,
          })),
          count: body.data?.length ?? 0,
        };
      }

      case 'africa.data.indicator': {
        const body = raw.body as AfricaDataResponse;
        return {
          count: body.data?.length ?? 0,
          data: (body.data ?? []).map((d) => ({
            country_code: d.country_code,
            metric_key: d.metric_key,
            metric_name: d.metric_name,
            year: d.year,
            value: d.value,
            unit: d.unit,
            source: d.source,
          })),
        };
      }

      case 'africa.politics.elections': {
        const body = raw.body as AfricaElectionsResponse;
        return {
          count: body.data?.length ?? 0,
          elections: (body.data ?? []).map((e) => ({
            country_code: e.country_code,
            country_name: e.country_name,
            election_scope: e.election_scope,
            election_type: e.election_type,
            status: e.status,
            start_date: e.start_date,
            end_date: e.end_date,
            year: e.year,
            description: e.description,
          })),
        };
      }

      default:
        return raw.body;
    }
  }
}
