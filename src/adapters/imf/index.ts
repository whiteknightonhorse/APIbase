import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { ImfDataMapperResponse } from './types';

const IMF_DATAMAPPER_BASE = 'https://www.imf.org/external/datamapper/api/v1';
const SOURCE = 'IMF World Economic Outlook (WEO)';

const INDICATORS: Record<string, { code: string; label: string; unit: string }> = {
  'imf.gdp_growth': {
    code: 'NGDP_RPCH',
    label: 'Real GDP growth',
    unit: 'Annual percent change',
  },
  'imf.inflation': {
    code: 'PCPIPCH',
    label: 'Inflation rate, average consumer prices',
    unit: 'Annual percent change',
  },
  'imf.fiscal_balance': {
    code: 'GGXCNL_NGDP',
    label: 'General government net lending/borrowing',
    unit: 'Percent of GDP',
  },
  'imf.current_account': {
    code: 'BCA_NGDPD',
    label: 'Current account balance',
    unit: 'Percent of GDP',
  },
};

/**
 * IMF DataMapper API adapter (UC-434).
 *
 * Supported tools (read-only):
 *   imf.gdp_growth      → NGDP_RPCH  (Real GDP growth)
 *   imf.inflation       → PCPIPCH    (Inflation, average consumer prices)
 *   imf.fiscal_balance  → GGXCNL_NGDP (General government net lending/borrowing)
 *   imf.current_account → BCA_NGDPD  (Current account balance, % of GDP)
 *
 * Upstream quirk (confirmed live): the documented `/{indicator}/{country}` path segment is
 * silently ignored — it always returns the full ~229-entry country/aggregate matrix regardless
 * of what country is requested (same class of gotcha as UC-440 Ensembl / UC-607 usgs-mrds /
 * UC-605 federalregister). This adapter always fetches the full `/{indicator}` matrix and
 * filters by country + year range client-side in parseResponse.
 *
 * Auth: None (IMF open data policy, CC BY 4.0, no registration).
 */
export class ImfAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'imf',
      baseUrl: IMF_DATAMAPPER_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const meta = INDICATORS[req.toolId];
    if (!meta) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    return {
      url: `${this.baseUrl}/${meta.code}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const meta = INDICATORS[req.toolId];
    const params = req.params as Record<string, unknown>;
    const body = raw.body as ImfDataMapperResponse;
    const series = body.values?.[meta.code] ?? {};

    const countryFilter = new Set<string>();
    if (typeof params.country === 'string' && params.country.trim().length > 0) {
      countryFilter.add(params.country.trim().toUpperCase());
    }
    if (Array.isArray(params.countries)) {
      for (const c of params.countries) {
        if (typeof c === 'string' && c.trim().length > 0) {
          countryFilter.add(c.trim().toUpperCase());
        }
      }
    }

    const startYear = typeof params.start_year === 'number' ? params.start_year : undefined;
    const endYear = typeof params.end_year === 'number' ? params.end_year : undefined;

    const data: Record<string, Record<string, number>> = {};
    for (const [countryCode, yearMap] of Object.entries(series)) {
      if (countryFilter.size > 0 && !countryFilter.has(countryCode)) continue;

      const filteredYears: Record<string, number> = {};
      for (const [year, value] of Object.entries(yearMap)) {
        const y = Number(year);
        if (startYear !== undefined && y < startYear) continue;
        if (endYear !== undefined && y > endYear) continue;
        filteredYears[year] = value;
      }
      data[countryCode] = filteredYears;
    }

    return {
      indicator: meta.code,
      label: meta.label,
      unit: meta.unit,
      source: SOURCE,
      country_count: Object.keys(data).length,
      data,
    };
  }
}
