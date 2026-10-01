import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

const AQS_EMAIL = 'api@apibase.pro';
const DEFAULT_MAX_ROWS = 200;
const ATTRIBUTION = 'US EPA Air Quality System (AQS), aqs.epa.gov';

/**
 * US EPA Air Quality System (AQS) Data API adapter (UC-800).
 *
 * Supported tools (read-only):
 *   epa-aqs.list_parameters → GET /list/parametersByClass
 *   epa-aqs.list_counties   → GET /list/countiesByState
 *   epa-aqs.monitors        → GET /monitors/byCounty
 *   epa-aqs.daily_data      → GET /dailyData/byCounty
 *   epa-aqs.annual_data     → GET /annualData/byCounty
 *
 * Auth: `email` + `key` query params (PROVIDER_KEY_EPA_AQS). Upstream limit is
 * 10 requests/minute; responses are { Header: [{status, rows}], Data: [...] }.
 */
export class EpaAqsAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'epa-aqs', baseUrl: 'https://aqs.epa.gov/data/api' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const qs = new URLSearchParams();
    qs.set('email', AQS_EMAIL);
    qs.set('key', this.apiKey);
    let path: string;

    switch (req.toolId) {
      case 'epa-aqs.list_parameters':
        path = '/list/parametersByClass';
        qs.set('pc', String(p.parameter_class ?? 'CRITERIA'));
        break;
      case 'epa-aqs.list_counties':
        path = '/list/countiesByState';
        qs.set('state', String(p.state));
        break;
      case 'epa-aqs.monitors':
        path = '/monitors/byCounty';
        this.setCountyParams(qs, p);
        break;
      case 'epa-aqs.daily_data':
        path = '/dailyData/byCounty';
        this.setCountyParams(qs, p);
        break;
      case 'epa-aqs.annual_data':
        path = '/annualData/byCounty';
        this.setCountyParams(qs, p);
        break;
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

    return {
      url: `${this.baseUrl}${path}?${qs.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  private setCountyParams(qs: URLSearchParams, p: Record<string, unknown>): void {
    qs.set('param', String(p.parameter_codes));
    qs.set('bdate', String(p.begin_date));
    qs.set('edate', String(p.end_date));
    qs.set('state', String(p.state));
    qs.set('county', String(p.county));
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as {
      Header?: Array<{ status?: string; error?: string[] }>;
      Data?: unknown[];
    };
    const header = body?.Header?.[0];
    if (!header) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'EPA AQS returned an unexpected response shape',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }
    const status = header.status ?? '';
    if (/^failed/i.test(status)) {
      const detail = (header.error ?? []).join('; ').slice(0, 300);
      const authFail = /key|email|account/i.test(detail);
      throw {
        code: authFail ? ProviderErrorCode.PROVIDER_AUTH : ProviderErrorCode.INPUT_REJECTED,
        httpStatus: authFail ? 502 : 422,
        message: `EPA AQS request failed: ${detail || status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    if (!Array.isArray(body.Data)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'EPA AQS returned an unexpected response shape',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    const p = req.params as Record<string, unknown>;
    const maxRows = typeof p.max_rows === 'number' ? p.max_rows : DEFAULT_MAX_ROWS;
    const rows = body.Data.slice(0, maxRows);
    return {
      status,
      total_rows: body.Data.length,
      returned_rows: rows.length,
      truncated: body.Data.length > rows.length,
      data: rows,
      attribution: ATTRIBUTION,
    };
  }
}
