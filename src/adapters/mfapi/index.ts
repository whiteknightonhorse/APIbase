import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  MfapiScheme,
  MfapiSchemeResponse,
  NavLatestOutput,
  NavHistoryOutput,
  SchemeSearchOutput,
  SchemeListOutput,
} from './types';

const MFAPI_BASE = 'https://api.mfapi.in';

/**
 * MFAPI adapter (UC-507).
 *
 * India Mutual Fund API — 37,000+ AMFI-registered schemes with daily NAV data.
 * No auth, no documented rate limits. MIT license.
 * maxResponseBytes overridden to 6MB to handle the /mf list (5.7MB raw JSON).
 */
export class MfapiAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'mfapi',
      baseUrl: MFAPI_BASE,
      maxResponseBytes: 6_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'User-Agent': 'apibase.pro/1.0',
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'mfapi.scheme_search':
      case 'mfapi.scheme_list':
        return { url: `${MFAPI_BASE}/mf`, method: 'GET', headers };

      case 'mfapi.nav_latest': {
        const code = encodeURIComponent(String(params.scheme_code ?? ''));
        return { url: `${MFAPI_BASE}/mf/${code}/latest`, method: 'GET', headers };
      }

      case 'mfapi.nav_history': {
        const code = encodeURIComponent(String(params.scheme_code ?? ''));
        return { url: `${MFAPI_BASE}/mf/${code}`, method: 'GET', headers };
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'mfapi.scheme_search': {
        const schemes = raw.body as MfapiScheme[];
        const query = String(params.query ?? '')
          .toLowerCase()
          .trim();
        const limit = Math.min(Number(params.limit) || 20, 100);

        const matches = query
          ? schemes.filter((s) => s.schemeName.toLowerCase().includes(query))
          : schemes;

        const output: SchemeSearchOutput = {
          total_matches: matches.length,
          returned: Math.min(matches.length, limit),
          schemes: matches.slice(0, limit).map((s) => ({
            scheme_code: s.schemeCode,
            scheme_name: s.schemeName,
            isin_growth: s.isinGrowth,
            isin_div_reinvestment: s.isinDivReinvestment,
          })),
        };
        return output;
      }

      case 'mfapi.scheme_list': {
        const schemes = raw.body as MfapiScheme[];
        const page = Math.max(1, Number(params.page) || 1);
        const perPage = Math.min(Number(params.per_page) || 50, 200);
        const start = (page - 1) * perPage;

        const output: SchemeListOutput = {
          total: schemes.length,
          page,
          per_page: perPage,
          schemes: schemes.slice(start, start + perPage).map((s) => ({
            scheme_code: s.schemeCode,
            scheme_name: s.schemeName,
            isin_growth: s.isinGrowth,
            isin_div_reinvestment: s.isinDivReinvestment,
          })),
        };
        return output;
      }

      case 'mfapi.nav_latest': {
        const resp = raw.body as MfapiSchemeResponse;
        const nav = resp.data[0];
        const output: NavLatestOutput = {
          scheme_code: resp.meta.scheme_code,
          scheme_name: resp.meta.scheme_name,
          fund_house: resp.meta.fund_house,
          scheme_type: resp.meta.scheme_type,
          scheme_category: resp.meta.scheme_category,
          isin_growth: resp.meta.isin_growth,
          nav: parseFloat(nav?.nav ?? '0'),
          nav_date: nav?.date ?? '',
        };
        return output;
      }

      case 'mfapi.nav_history': {
        const resp = raw.body as MfapiSchemeResponse;
        const limit = Math.min(Number(params.limit) || 100, 1000);
        const records = resp.data.slice(0, limit).map((r) => ({
          date: r.date,
          nav: parseFloat(r.nav),
        }));

        const output: NavHistoryOutput = {
          scheme_code: resp.meta.scheme_code,
          scheme_name: resp.meta.scheme_name,
          fund_house: resp.meta.fund_house,
          scheme_type: resp.meta.scheme_type,
          scheme_category: resp.meta.scheme_category,
          isin_growth: resp.meta.isin_growth,
          total_records: resp.data.length,
          returned_records: records.length,
          records,
        };
        return output;
      }

      default:
        return raw.body;
    }
  }
}
