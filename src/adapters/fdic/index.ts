import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * FDIC BankFind Suite adapter (UC-191).
 *
 * Supported tools:
 *   fdic.search      → GET /banks/institutions
 *   fdic.details     → GET /banks/institutions (by CERT filter)
 *   fdic.financials  → GET /banks/financials
 *   fdic.failures    → GET /banks/failures
 *
 * Auth: None (US Government open data).
 * Base URL: https://api.fdic.gov/banks
 */
export class FdicAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'fdic',
      baseUrl: 'https://api.fdic.gov/banks',
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
      case 'fdic.search':
        return this.buildSearchRequest(params, headers);
      case 'fdic.details':
        return this.buildDetailsRequest(params, headers);
      case 'fdic.financials':
        return this.buildFinancialsRequest(params, headers);
      case 'fdic.failures':
        return this.buildFailuresRequest(params, headers);
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
    const data = body.data as Array<{ data: Record<string, unknown> }> | undefined;
    const totals = body.totals as Record<string, unknown> | undefined;

    // Flatten nested {data: {data: {...}}} to clean objects
    const items = (data ?? []).map((item) => item.data ?? item);

    switch (req.toolId) {
      case 'fdic.search':
        return {
          total: totals?.count ?? items.length,
          institutions: items.map((inst) => ({
            cert: inst.CERT,
            name: inst.NAME,
            city: inst.CITY,
            state: inst.STNAME ?? inst.STALP,
            charter_class: inst.BKCLASS,
            active: inst.ACTIVE === 1,
            total_assets_thousands: inst.ASSET,
            total_deposits_thousands: inst.DEP,
            established: inst.ESTYMD,
            web: inst.WEBADDR,
          })),
        };

      case 'fdic.details':
        if (items.length === 0) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 404,
            message: 'Institution not found',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return this.formatInstitutionDetail(items[0]);

      case 'fdic.financials':
        return {
          total: totals?.count ?? items.length,
          reports: items.map((r) => ({
            cert: r.CERT,
            report_date: r.REPDTE,
            total_assets: r.ASSET,
            total_deposits: r.DEP,
            net_loans: r.LNLSNET,
            equity_capital: r.EQ,
            net_income: r.NETINC,
            return_on_assets: r.ROA,
            return_on_equity: r.ROE,
            net_interest_margin: r.NIM,
            efficiency_ratio: r.EFFR,
          })),
        };

      case 'fdic.failures':
        return {
          total: totals?.count ?? items.length,
          failures: items.map((f) => ({
            cert: f.CERT,
            name: f.NAME,
            city: f.CITY,
            state: f.STATE,
            failure_date: f.FAILDATE,
            closing_date: f.CLDATE,
            total_deposits: f.TOTALDEPOSITS,
            total_assets: f.PSTALASSET,
            acquiring_institution: f.ACQUIRINGINSTITUTION,
            estimated_loss: f.COST,
          })),
        };

      default:
        return body;
    }
  }

  private formatInstitutionDetail(inst: Record<string, unknown>): Record<string, unknown> {
    return {
      cert: inst.CERT,
      name: inst.NAME,
      city: inst.CITY,
      state: inst.STNAME,
      state_code: inst.STALP,
      address: inst.ADDRESS,
      zip: inst.ZIP,
      county: inst.COUNTY,
      charter_class: inst.BKCLASS,
      charter_agent: inst.CHRTAGNT,
      primary_regulator: inst.REGAGNT,
      fed_reserve_district: inst.FEDDESC,
      fdic_region: inst.FDICREGN,
      active: inst.ACTIVE === 1,
      total_assets_thousands: inst.ASSET,
      total_deposits_thousands: inst.DEP,
      equity_capital_thousands: inst.EQ,
      net_income_thousands: inst.NETINC,
      return_on_assets: inst.ROA,
      return_on_equity: inst.ROE,
      branches_domestic: inst.OFFDOM,
      branches_foreign: inst.OFFFOR,
      established_date: inst.ESTYMD,
      insured_date: inst.INSDATE,
      latitude: inst.LATITUDE,
      longitude: inst.LONGITUDE,
      website: inst.WEBADDR,
    };
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const filters: string[] = [];

    if (params.name) qs.set('search', String(params.name));
    if (params.state) filters.push(`STNAME:"${String(params.state)}"`);
    if (params.city) filters.push(`CITY:"${String(params.city)}"`);
    if (params.charter_class) filters.push(`BKCLASS:${String(params.charter_class)}`);
    if (params.active !== false) filters.push('ACTIVE:1');

    if (filters.length > 0) qs.set('filters', filters.join(' AND '));
    qs.set('fields', 'CERT,NAME,CITY,STNAME,STALP,BKCLASS,ACTIVE,ASSET,DEP,ESTYMD,WEBADDR');
    qs.set('sort_by', 'ASSET');
    qs.set('sort_order', 'DESC');
    qs.set('limit', String(params.limit ?? 10));

    return { url: `${this.baseUrl}/institutions?${qs.toString()}`, method: 'GET', headers };
  }

  private buildDetailsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const cert = String(params.cert);
    const qs = new URLSearchParams();
    qs.set('filters', `CERT:${cert}`);
    qs.set('limit', '1');

    return { url: `${this.baseUrl}/institutions?${qs.toString()}`, method: 'GET', headers };
  }

  private buildFinancialsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('filters', `CERT:${String(params.cert)}`);
    qs.set('sort_by', 'REPDTE');
    qs.set('sort_order', 'DESC');
    qs.set('limit', String(params.limit ?? 4));

    return { url: `${this.baseUrl}/financials?${qs.toString()}`, method: 'GET', headers };
  }

  private buildFailuresRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const filters: string[] = [];

    if (params.state) filters.push(`STATE:"${String(params.state)}"`);
    if (filters.length > 0) qs.set('filters', filters.join(' AND '));
    qs.set('sort_by', 'FAILDATE');
    qs.set('sort_order', 'DESC');
    qs.set('limit', String(params.limit ?? 10));

    return { url: `${this.baseUrl}/failures?${qs.toString()}`, method: 'GET', headers };
  }
}
