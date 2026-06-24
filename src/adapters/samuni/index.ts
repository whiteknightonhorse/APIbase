import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  MuniApiResponse,
  MuniMunicipality,
  MuniAuditOpinion,
  MuniIncExp,
  MuniOfficial,
  MunicipalitiesOutput,
  AuditOpinionsOutput,
  IncExpOutput,
  OfficialsOutput,
} from './types';

const BASE = 'https://municipaldata.treasury.gov.za/api';

/**
 * SA National Treasury Municipal Finance adapter (UC-519).
 *
 * Financial and administrative data for all 257 South African municipalities:
 * income/expenditure, balance sheet, audit outcomes, officials.
 * Open data — no auth, free commercial use.
 */
export class SaMuniAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'samuni', baseUrl: BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'samuni.municipalities': {
        const qp = new URLSearchParams();
        if (p.province_code)
          qp.set('municipality.province_code', String(p.province_code).toUpperCase());
        if (p.category) qp.set('municipality.category', String(p.category).toUpperCase());
        qp.set('_limit', String(Math.min(Number(p.limit) || 50, 300)));
        return {
          url: `${BASE}/cubes/municipalities/facts?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'samuni.audit_opinions': {
        const qp = new URLSearchParams();
        if (p.demarcation_code)
          qp.set('demarcation.code', String(p.demarcation_code).toUpperCase());
        if (p.year) qp.set('financial_year_end.year', String(Number(p.year)));
        qp.set('_limit', String(Math.min(Number(p.limit) || 20, 100)));
        return {
          url: `${BASE}/cubes/audit_opinions/facts?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'samuni.income_expenditure': {
        const qp = new URLSearchParams();
        qp.set('demarcation.code', String(p.demarcation_code).toUpperCase());
        if (p.year) qp.set('financial_year_end.year', String(Number(p.year)));
        // Use audited actuals by default for clean summary data
        qp.set('amount_type.code', 'AUDA');
        qp.set('period_length.length', 'year');
        qp.set('_limit', String(Math.min(Number(p.limit) || 50, 200)));
        return { url: `${BASE}/cubes/incexp_v2/facts?${qp.toString()}`, method: 'GET', headers };
      }

      case 'samuni.officials': {
        const qp = new URLSearchParams();
        qp.set('municipality.demarcation_code', String(p.demarcation_code).toUpperCase());
        if (p.role) qp.set('role.role', String(p.role));
        qp.set('_limit', '50');
        return { url: `${BASE}/cubes/officials/facts?${qp.toString()}`, method: 'GET', headers };
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
      case 'samuni.municipalities':
        return this.parseMunicipalities(body);
      case 'samuni.audit_opinions':
        return this.parseAuditOpinions(body);
      case 'samuni.income_expenditure':
        return this.parseIncExp(body, req.params as Record<string, unknown>);
      case 'samuni.officials':
        return this.parseOfficials(body, req.params as Record<string, unknown>);
      default:
        return body;
    }
  }

  private parseMunicipalities(body: Record<string, unknown>): MunicipalitiesOutput {
    const resp = body as unknown as MuniApiResponse<MuniMunicipality>;
    return {
      total: resp.total_fact_count,
      municipalities: (resp.data ?? []).map((m) => ({
        demarcation_code: m['municipality.demarcation_code'] ?? '',
        name: m['municipality.name'] ?? '',
        long_name: m['municipality.long_name'] ?? '',
        province_name: m['municipality.province_name'] ?? '',
        province_code: m['municipality.province_code'] ?? '',
        category: m['municipality.category'] ?? '',
        phone: m['municipality.phone_number']?.trim() || undefined,
        url: m['municipality.url']?.trim() || undefined,
      })),
    };
  }

  private parseAuditOpinions(body: Record<string, unknown>): AuditOpinionsOutput {
    const resp = body as unknown as MuniApiResponse<MuniAuditOpinion>;
    return {
      total: resp.total_fact_count,
      opinions: (resp.data ?? []).map((o) => ({
        demarcation_code: o['demarcation.code'] ?? '',
        municipality_name: o['demarcation.label'] ?? '',
        year: o['financial_year_end.year'] ?? 0,
        opinion_code: o['opinion.code'] ?? '',
        opinion_label: o['opinion.label'] ?? '',
        report_url: o['opinion.report_url'] || undefined,
      })),
    };
  }

  private parseIncExp(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): IncExpOutput {
    const resp = body as unknown as MuniApiResponse<MuniIncExp>;
    const rows = resp.data ?? [];
    const first = rows[0];
    return {
      demarcation_code: String(params.demarcation_code ?? '').toUpperCase(),
      municipality_name: first?.['demarcation.label'] ?? '',
      total_records: resp.total_fact_count,
      items: rows.map((r) => ({
        item_code: r['item.code'] ?? '',
        item_label: r['item.label'] ?? '',
        year: r['financial_year_end.year'] ?? 0,
        amount_type: r['amount_type.code'] ?? '',
        amount_type_label: r['amount_type.label'] ?? '',
        amount: r.amount,
      })),
    };
  }

  private parseOfficials(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): OfficialsOutput {
    const resp = body as unknown as MuniApiResponse<MuniOfficial>;
    return {
      demarcation_code: String(params.demarcation_code ?? '').toUpperCase(),
      total: resp.total_fact_count,
      officials: (resp.data ?? []).map((o) => ({
        role: o['role.role'] ?? '',
        name: o['contact_details.name'] ?? '',
        title: o['contact_details.title'] || undefined,
        email: o['contact_details.email_address']?.trim() || undefined,
        phone: o['contact_details.phone_number']?.trim() || undefined,
      })),
    };
  }
}
