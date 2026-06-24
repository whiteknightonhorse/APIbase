import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  FrankfurterRatesResponse,
  FrankfurterSeriesResponse,
  FrankfurterCurrenciesResponse,
} from './types';

const BASE_URL = 'https://api.frankfurter.dev/v1';

/**
 * Frankfurter.dev adapter (UC-516).
 *
 * ECB exchange rates, 33 currencies, historical data since 1999.
 * New domain (api.frankfurter.dev/v1) replacing the deprecated frankfurter.app.
 * No auth required, public domain ECB data.
 *
 * Tools:
 *   frankfurter.latest      -> /v1/latest
 *   frankfurter.historical  -> /v1/{date}
 *   frankfurter.series      -> /v1/{start}..{end}
 *   frankfurter.currencies  -> /v1/currencies
 */
export class FrankfurterAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'frankfurter', baseUrl: BASE_URL });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'frankfurter.latest': {
        const url = new URL(`${BASE_URL}/latest`);
        if (params.base) url.searchParams.set('from', String(params.base).toUpperCase());
        if (params.symbols) url.searchParams.set('to', String(params.symbols).toUpperCase());
        if (params.amount) url.searchParams.set('amount', String(params.amount));
        return { url: url.toString(), method: 'GET', headers };
      }
      case 'frankfurter.historical': {
        const date = encodeURIComponent(String(params.date));
        const url = new URL(`${BASE_URL}/${date}`);
        if (params.base) url.searchParams.set('from', String(params.base).toUpperCase());
        if (params.symbols) url.searchParams.set('to', String(params.symbols).toUpperCase());
        if (params.amount) url.searchParams.set('amount', String(params.amount));
        return { url: url.toString(), method: 'GET', headers };
      }
      case 'frankfurter.series': {
        const startDate = String(params.start_date);
        const endDate = params.end_date ? String(params.end_date) : '';
        const range = endDate
          ? `${encodeURIComponent(startDate)}..${encodeURIComponent(endDate)}`
          : `${encodeURIComponent(startDate)}..`;
        const url = new URL(`${BASE_URL}/${range}`);
        if (params.base) url.searchParams.set('from', String(params.base).toUpperCase());
        if (params.symbols) url.searchParams.set('to', String(params.symbols).toUpperCase());
        if (params.amount) url.searchParams.set('amount', String(params.amount));
        return { url: url.toString(), method: 'GET', headers };
      }
      case 'frankfurter.currencies': {
        return { url: `${BASE_URL}/currencies`, method: 'GET', headers };
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
    const body = raw.body;

    switch (req.toolId) {
      case 'frankfurter.latest':
      case 'frankfurter.historical': {
        const data = body as FrankfurterRatesResponse;
        if (!data.rates || typeof data.rates !== 'object') {
          throw new Error('Missing rates in Frankfurter response');
        }
        return {
          amount: data.amount,
          base: data.base,
          date: data.date,
          rates: data.rates,
          rate_count: Object.keys(data.rates).length,
        };
      }
      case 'frankfurter.series': {
        const data = body as FrankfurterSeriesResponse;
        if (!data.rates || typeof data.rates !== 'object') {
          throw new Error('Missing rates in Frankfurter series response');
        }
        const dates = Object.keys(data.rates).sort();
        return {
          amount: data.amount,
          base: data.base,
          start_date: data.start_date,
          end_date: data.end_date,
          dates_count: dates.length,
          rates: data.rates,
        };
      }
      case 'frankfurter.currencies': {
        const data = body as FrankfurterCurrenciesResponse;
        const currencies = Object.entries(data).map(([code, name]) => ({ code, name }));
        return {
          count: currencies.length,
          currencies,
        };
      }
      default:
        throw new Error(`Unsupported tool: ${req.toolId}`);
    }
  }
}
