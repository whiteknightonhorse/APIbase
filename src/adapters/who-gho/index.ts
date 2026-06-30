import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  WhoIndicator,
  WhoDataValue,
  WhoDimensionValue,
  WhoIndicatorSearchOutput,
  WhoIndicatorDataOutput,
  WhoCountryHealthOutput,
  WhoDimensionValuesOutput,
} from './types';

const WHO_GHO_BASE = 'https://ghoapi.azureedge.net/api';

/**
 * WHO Global Health Observatory OData adapter (UC-558).
 *
 * Free, no-auth access to 3,000+ WHO health indicators including disease
 * surveillance, immunization, life expectancy, mortality, and SDG health metrics.
 * OData v4 protocol. CC BY-NC-SA 3.0 IGO.
 */
export class WhoGhoAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'who-gho', baseUrl: WHO_GHO_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const top = Math.min(Number(params.limit) || 20, 100);

    switch (req.toolId) {
      case 'who.indicator_search': {
        const qp = new URLSearchParams();
        const keyword = params.keyword ? String(params.keyword) : '';
        if (keyword) {
          qp.set(
            '$filter',
            `contains(tolower(IndicatorName), '${keyword.toLowerCase().replace(/'/g, "''")}')`,
          );
        }
        qp.set('$top', String(top));
        qp.set('$select', 'IndicatorCode,IndicatorName,FullName,Definition');
        return { url: `${WHO_GHO_BASE}/Indicator?${qp.toString()}`, method: 'GET', headers };
      }

      case 'who.indicator_data': {
        const code = encodeURIComponent(String(params.indicator_code));
        const filters: string[] = [];
        if (params.country_code) {
          filters.push(
            `SpatialDim eq '${String(params.country_code).toUpperCase().replace(/'/g, "''")}'`,
          );
        }
        if (params.year_from) {
          filters.push(`TimeDim ge ${Number(params.year_from)}`);
        }
        if (params.year_to) {
          filters.push(`TimeDim le ${Number(params.year_to)}`);
        }
        if (params.sex) {
          filters.push(`Dim1 eq '${String(params.sex).replace(/'/g, "''")}'`);
        }
        const qp = new URLSearchParams();
        if (filters.length) qp.set('$filter', filters.join(' and '));
        qp.set('$top', String(top));
        qp.set('$orderby', 'TimeDim desc');
        return {
          url: `${WHO_GHO_BASE}/${code}?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'who.country_health': {
        const country = String(params.country_code).toUpperCase().replace(/'/g, "''");
        const year = params.year ? Number(params.year) : null;
        const qp = new URLSearchParams();
        const filters = [`SpatialDim eq '${country}'`];
        if (year) filters.push(`TimeDim eq ${year}`);
        qp.set('$filter', filters.join(' and '));
        qp.set('$top', String(top));
        qp.set('$orderby', 'TimeDim desc');
        const indicatorCode = params.indicator_code
          ? encodeURIComponent(String(params.indicator_code))
          : 'WHOSIS_000001';
        return {
          url: `${WHO_GHO_BASE}/${indicatorCode}?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'who.dimension_values': {
        const dim = encodeURIComponent(String(params.dimension).toUpperCase());
        const qp = new URLSearchParams();
        qp.set('$top', String(top));
        if (params.search) {
          const s = String(params.search).replace(/'/g, "''");
          qp.set('$filter', `contains(tolower(Title), '${s.toLowerCase()}')`);
        }
        return {
          url: `${WHO_GHO_BASE}/DIMENSION/${dim}/DimensionValues?${qp.toString()}`,
          method: 'GET',
          headers,
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'who.indicator_search':
        return this.parseIndicatorSearch(body);
      case 'who.indicator_data':
        return this.parseIndicatorData(body, req.params as Record<string, unknown>);
      case 'who.country_health':
        return this.parseCountryHealth(body, req.params as Record<string, unknown>);
      case 'who.dimension_values':
        return this.parseDimensionValues(body, req.params as Record<string, unknown>);
      default:
        return body;
    }
  }

  private parseIndicatorSearch(body: Record<string, unknown>): WhoIndicatorSearchOutput {
    const indicators = (body.value ?? []) as WhoIndicator[];
    return {
      total: indicators.length,
      indicators: indicators.map((ind) => ({
        code: ind.IndicatorCode,
        name: ind.IndicatorName,
        full_name: ind.FullName ?? null,
        definition: ind.Definition ?? null,
      })),
    };
  }

  private parseIndicatorData(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): WhoIndicatorDataOutput {
    const values = (body.value ?? []) as WhoDataValue[];
    return {
      indicator_code: String(params.indicator_code ?? ''),
      total: values.length,
      values: values.map((v) => ({
        country: v.SpatialDim ?? null,
        year: v.TimeDim ?? null,
        value: v.Value ?? null,
        numeric_value: v.NumericValue ?? null,
        low: v.Low ?? null,
        high: v.High ?? null,
        sex: v.Dim1Type === 'SEX' ? (v.Dim1 ?? null) : null,
        age_group: v.Dim1Type === 'AGEGROUP' ? (v.Dim1 ?? null) : null,
      })),
    };
  }

  private parseCountryHealth(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): WhoCountryHealthOutput {
    const values = (body.value ?? []) as WhoDataValue[];
    return {
      country_code: String(params.country_code ?? '').toUpperCase(),
      year: params.year ? Number(params.year) : null,
      total: values.length,
      values: values.map((v) => ({
        indicator_code: v.IndicatorCode,
        value: v.Value ?? null,
        numeric_value: v.NumericValue ?? null,
        year: v.TimeDim ?? null,
        sex: v.Dim1Type === 'SEX' ? (v.Dim1 ?? null) : null,
      })),
    };
  }

  private parseDimensionValues(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): WhoDimensionValuesOutput {
    const values = (body.value ?? []) as WhoDimensionValue[];
    return {
      dimension: String(params.dimension ?? '').toUpperCase(),
      total: values.length,
      values: values.map((v) => ({
        code: v.Code,
        title: v.Title,
        parent_code: v.ParentCode ?? null,
      })),
    };
  }
}
