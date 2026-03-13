import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  FawazRatesResponse,
  FrankfurterRatesResponse,
  FredObservationsResponse,
  WorldBankResponse,
  TreasuryDataResponse,
  OpenIbanResponse,
} from './types';

/**
 * Finance adapter (UC-016).
 *
 * Routes to 6 upstream providers based on toolId:
 *   finance.exchange_rates    -> fawazahmed0 CDN (200+ currencies, no auth)
 *   finance.ecb_rates         -> Frankfurter/ECB (~33 fiat, no auth)
 *   finance.economic_indicator -> FRED (requires PROVIDER_KEY_FRED)
 *   finance.country_data      -> World Bank API v2 (no auth)
 *   finance.treasury_data     -> US Treasury Fiscal Data (no auth)
 *   finance.validate_iban     -> OpenIBAN (no auth)
 */
export class FinanceAdapter extends BaseAdapter {
  private readonly fredApiKey: string;

  private static readonly FAWAZ_BASE =
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api';
  private static readonly FRANKFURTER_BASE = 'https://api.frankfurter.app';
  private static readonly FRED_BASE = 'https://api.stlouisfed.org/fred';
  private static readonly WORLDBANK_BASE = 'https://api.worldbank.org/v2';
  private static readonly TREASURY_BASE =
    'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od';
  private static readonly OPENIBAN_BASE = 'https://openiban.com/validate';

  constructor(fredApiKey?: string) {
    super({
      provider: 'finance',
      baseUrl: 'https://api.frankfurter.app',
    });
    this.fredApiKey = fredApiKey ?? '';
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'finance.exchange_rates':
        return this.buildExchangeRates(params, headers);
      case 'finance.ecb_rates':
        return this.buildEcbRates(params, headers);
      case 'finance.economic_indicator':
        return this.buildEconomicIndicator(params, headers);
      case 'finance.country_data':
        return this.buildCountryData(params, headers);
      case 'finance.treasury_data':
        return this.buildTreasuryData(params, headers);
      case 'finance.validate_iban':
        return this.buildValidateIban(params, headers);
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
    const body = raw.body;

    switch (req.toolId) {
      case 'finance.exchange_rates': {
        const data = body as FawazRatesResponse;
        if (!data.date) {
          throw new Error('Missing date in fawazahmed0 response');
        }
        return data;
      }
      case 'finance.ecb_rates': {
        const data = body as FrankfurterRatesResponse;
        if (!data.rates || typeof data.rates !== 'object') {
          throw new Error('Missing rates in Frankfurter response');
        }
        return data;
      }
      case 'finance.economic_indicator': {
        const data = body as FredObservationsResponse;
        if (!data.observations) {
          throw new Error('Missing observations in FRED response');
        }
        // Normalize FRED "." values to null
        return {
          ...data,
          observations: data.observations.map((obs) => ({
            date: obs.date,
            value: obs.value === '.' ? null : Number(obs.value),
          })),
        };
      }
      case 'finance.country_data': {
        // World Bank returns [meta, data[]] tuple
        const tuple = body as WorldBankResponse;
        if (!Array.isArray(tuple) || tuple.length < 2) {
          throw new Error('Invalid World Bank response format');
        }
        const [meta, dataPoints] = tuple;
        return {
          meta,
          data: dataPoints ?? [],
        };
      }
      case 'finance.treasury_data': {
        const data = body as TreasuryDataResponse;
        if (!data.data) {
          throw new Error('Missing data in Treasury response');
        }
        return data;
      }
      case 'finance.validate_iban': {
        const data = body as OpenIbanResponse;
        if (typeof data.valid !== 'boolean') {
          throw new Error('Missing valid field in OpenIBAN response');
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // fawazahmed0 Currency API (CDN, 200+ currencies)
  // ---------------------------------------------------------------------------

  private buildExchangeRates(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const base = String(params.base || 'usd').toLowerCase();
    const date = params.date ? String(params.date) : 'latest';
    const tag = date === 'latest' ? '@latest' : `@${date}`;

    return {
      url: `${FinanceAdapter.FAWAZ_BASE}${tag}/v1/currencies/${encodeURIComponent(base)}.json`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Frankfurter / ECB (~33 fiat currencies)
  // ---------------------------------------------------------------------------

  private buildEcbRates(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const base = String(params.base || 'USD').toUpperCase();
    const date = params.date ? String(params.date) : 'latest';

    const qs = new URLSearchParams();
    qs.set('from', base);
    if (params.currencies) {
      const currencies = params.currencies as string[];
      qs.set('to', currencies.map((c) => c.toUpperCase()).join(','));
    }

    return {
      url: `${FinanceAdapter.FRANKFURTER_BASE}/${date}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // FRED (Federal Reserve Economic Data)
  // ---------------------------------------------------------------------------

  private buildEconomicIndicator(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    if (!this.fredApiKey) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: 'FRED API key not configured (PROVIDER_KEY_FRED)',
        provider: this.provider,
        toolId: 'finance.economic_indicator',
        durationMs: 0,
      };
    }

    const qs = new URLSearchParams();
    qs.set('series_id', String(params.series_id));
    qs.set('api_key', this.fredApiKey);
    qs.set('file_type', 'json');
    if (params.observation_start) qs.set('observation_start', String(params.observation_start));
    if (params.observation_end) qs.set('observation_end', String(params.observation_end));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.sort_order) qs.set('sort_order', String(params.sort_order));

    return {
      url: `${FinanceAdapter.FRED_BASE}/series/observations?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // World Bank API v2 (16K+ indicators)
  // ---------------------------------------------------------------------------

  private buildCountryData(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const countryCode = String(params.country_code || 'US');
    const indicatorId = String(params.indicator_id);

    const qs = new URLSearchParams();
    qs.set('format', 'json');
    if (params.date_range) qs.set('date', String(params.date_range));
    if (params.per_page) qs.set('per_page', String(params.per_page));

    return {
      url: `${FinanceAdapter.WORLDBANK_BASE}/country/${encodeURIComponent(countryCode)}/indicator/${encodeURIComponent(indicatorId)}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // US Treasury Fiscal Data
  // ---------------------------------------------------------------------------

  private buildTreasuryData(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const endpoint = String(params.endpoint);

    const qs = new URLSearchParams();
    qs.set('page[size]', String(params.page_size || 100));
    qs.set('sort', String(params.sort || '-record_date'));
    if (params.filter) qs.set('filter', String(params.filter));

    return {
      url: `${FinanceAdapter.TREASURY_BASE}/${encodeURIComponent(endpoint)}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // OpenIBAN (IBAN validation)
  // ---------------------------------------------------------------------------

  private buildValidateIban(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const iban = String(params.iban).replace(/\s/g, '').toUpperCase();

    return {
      url: `${FinanceAdapter.OPENIBAN_BASE}/${encodeURIComponent(iban)}?getBIC=true&validateBankCode=true`,
      method: 'GET',
      headers,
    };
  }
}
