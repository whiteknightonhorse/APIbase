import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { WhoIndicator, WhoDataPoint, WhoCountry } from './types';

/**
 * WHO Global Health Observatory adapter (UC-193).
 *
 * Supported tools:
 *   who.indicators → GET /Indicator
 *   who.data       → GET /{indicator_code}
 *   who.countries  → GET /DIMENSION/COUNTRY/DimensionValues
 *
 * Auth: None (UN/WHO open data). OData v4 REST interface.
 */
export class WhoAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'who',
      baseUrl: 'https://ghoapi.azureedge.net/api',
      timeoutMs: 15000, // WHO can be slow
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'who.indicators':
        return this.buildIndicatorsRequest(params, headers);
      case 'who.data':
        return this.buildDataRequest(params, headers);
      case 'who.countries':
        return this.buildCountriesRequest(params, headers);
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
    const body = raw.body as Record<string, unknown>;
    const values = body.value as unknown[] | undefined;

    switch (req.toolId) {
      case 'who.indicators': {
        const items = (values ?? []) as WhoIndicator[];
        return {
          total: items.length,
          indicators: items.map((i) => ({
            code: i.IndicatorCode,
            name: i.IndicatorName,
          })),
        };
      }

      case 'who.data': {
        const items = (values ?? []) as WhoDataPoint[];
        return {
          total: items.length,
          data: items.map((d) => ({
            indicator: d.IndicatorCode,
            country: d.SpatialDim,
            year: d.TimeDim,
            value: d.NumericValue ?? d.Value,
            dimension: d.Dim1,
            low: d.Low,
            high: d.High,
            comments: d.Comments,
          })),
        };
      }

      case 'who.countries': {
        const items = (values ?? []) as WhoCountry[];
        return {
          total: items.length,
          countries: items.map((c) => ({
            code: c.Code,
            name: c.Title,
            parent_code: c.ParentCode,
            parent_name: c.ParentTitle,
          })),
        };
      }

      default:
        return body;
    }
  }

  private buildIndicatorsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const parts: string[] = [];
    if (params.search) {
      parts.push(`$filter=contains(IndicatorName,'${String(params.search)}')`);
    }
    parts.push(`$top=${params.limit ?? 20}`);
    return { url: `${this.baseUrl}/Indicator?${parts.join('&')}`, method: 'GET', headers };
  }

  private buildDataRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const indicator = String(params.indicator);
    const filters: string[] = [];

    if (params.country) filters.push(`SpatialDim eq '${String(params.country)}'`);
    if (params.year_from) filters.push(`TimeDim ge '${String(params.year_from)}'`);
    if (params.year_to) filters.push(`TimeDim le '${String(params.year_to)}'`);

    const parts: string[] = [];
    if (filters.length > 0) parts.push(`$filter=${filters.join(' and ')}`);
    parts.push(`$orderby=TimeDim desc`);
    parts.push(`$top=${params.limit ?? 20}`);

    return { url: `${this.baseUrl}/${indicator}?${parts.join('&')}`, method: 'GET', headers };
  }

  private buildCountriesRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const parts: string[] = [];
    if (params.search) {
      parts.push(`$filter=contains(Title,'${String(params.search)}')`);
    }
    parts.push(`$top=${params.limit ?? 50}`);
    return { url: `${this.baseUrl}/DIMENSION/COUNTRY/DimensionValues?${parts.join('&')}`, method: 'GET', headers };
  }
}
