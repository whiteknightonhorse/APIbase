import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  UnhcrApiResponse,
  UnhcrPopulationItem,
  UnhcrSolutionsItem,
  UnhcrAsylumApplicationItem,
  UnhcrAsylumDecisionItem,
} from './types';

const UNHCR_BASE = 'https://api.unhcr.org/population/v1';

/**
 * UNHCR Population Data API adapter (UC-511).
 *
 * Global refugee and displacement statistics 1951–present.
 * UNHCR Data License (open for non-commercial use). No auth, no rate limits documented.
 */
export class UnhcrAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'unhcr', baseUrl: UNHCR_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    const qp = new URLSearchParams();
    if (params.year) qp.set('year', String(Number(params.year)));
    if (params.coo) qp.set('coo', String(params.coo).toUpperCase());
    if (params.coa) qp.set('coa', String(params.coa).toUpperCase());
    qp.set('limit', String(Math.min(Number(params.limit) || 10, 100)));

    const query = qp.toString();

    switch (req.toolId) {
      case 'unhcr.population':
        return { url: `${UNHCR_BASE}/population/?${query}`, method: 'GET', headers };

      case 'unhcr.solutions':
        return { url: `${UNHCR_BASE}/solutions/?${query}`, method: 'GET', headers };

      case 'unhcr.asylum_applications':
        return { url: `${UNHCR_BASE}/asylum-applications/?${query}`, method: 'GET', headers };

      case 'unhcr.asylum_decisions':
        return { url: `${UNHCR_BASE}/asylum-decisions/?${query}`, method: 'GET', headers };

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
    const body = raw.body as UnhcrApiResponse<unknown>;

    switch (req.toolId) {
      case 'unhcr.population':
        return this.parsePopulation(body as UnhcrApiResponse<UnhcrPopulationItem>);
      case 'unhcr.solutions':
        return this.parseSolutions(body as UnhcrApiResponse<UnhcrSolutionsItem>);
      case 'unhcr.asylum_applications':
        return this.parseAsylumApplications(body as UnhcrApiResponse<UnhcrAsylumApplicationItem>);
      case 'unhcr.asylum_decisions':
        return this.parseAsylumDecisions(body as UnhcrApiResponse<UnhcrAsylumDecisionItem>);
      default:
        return body;
    }
  }

  private toNum(v: number | string): number | null {
    if (v === '-' || v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private parsePopulation(body: UnhcrApiResponse<UnhcrPopulationItem>) {
    return {
      page: body.page,
      max_pages: body.maxPages,
      total: Array.isArray(body.total) ? null : body.total,
      items: body.items.map((item) => ({
        year: item.year,
        country_of_origin: item.coo === '-' ? null : item.coo,
        country_of_origin_name: item.coo_name === '-' ? null : item.coo_name,
        country_of_asylum: item.coa === '-' ? null : item.coa,
        country_of_asylum_name: item.coa_name === '-' ? null : item.coa_name,
        refugees: this.toNum(item.refugees),
        asylum_seekers: this.toNum(item.asylum_seekers),
        returned_refugees: this.toNum(item.returned_refugees),
        idps: this.toNum(item.idps),
        returned_idps: this.toNum(item.returned_idps),
        stateless: this.toNum(item.stateless),
        other_of_concern: this.toNum(item.ooc),
        other_in_need: this.toNum(item.oip),
        host_community: this.toNum(item.hst),
      })),
    };
  }

  private parseSolutions(body: UnhcrApiResponse<UnhcrSolutionsItem>) {
    return {
      page: body.page,
      max_pages: body.maxPages,
      total: Array.isArray(body.total) ? null : body.total,
      items: body.items.map((item) => ({
        year: item.year,
        country_of_origin: item.coo === '-' ? null : item.coo,
        country_of_origin_name: item.coo_name === '-' ? null : item.coo_name,
        country_of_asylum: item.coa === '-' ? null : item.coa,
        country_of_asylum_name: item.coa_name === '-' ? null : item.coa_name,
        returned_refugees: this.toNum(item.returned_refugees),
        resettlement: this.toNum(item.resettlement),
        naturalisation: this.toNum(item.naturalisation),
        returned_idps: this.toNum(item.returned_idps),
      })),
    };
  }

  private parseAsylumApplications(body: UnhcrApiResponse<UnhcrAsylumApplicationItem>) {
    return {
      page: body.page,
      max_pages: body.maxPages,
      total: Array.isArray(body.total) ? null : body.total,
      items: body.items.map((item) => ({
        year: item.year,
        country_of_origin: item.coo === '-' ? null : item.coo,
        country_of_origin_name: item.coo_name === '-' ? null : item.coo_name,
        country_of_asylum: item.coa === '-' ? null : item.coa,
        country_of_asylum_name: item.coa_name === '-' ? null : item.coa_name,
        procedure_type: item.procedure_type,
        application_type: item.app_type,
        decision_level: item.dec_level,
        applicant_category: item.app_pc,
        applied: this.toNum(item.applied),
      })),
    };
  }

  private parseAsylumDecisions(body: UnhcrApiResponse<UnhcrAsylumDecisionItem>) {
    return {
      page: body.page,
      max_pages: body.maxPages,
      total: Array.isArray(body.total) ? null : body.total,
      items: body.items.map((item) => ({
        year: item.year,
        country_of_origin: item.coo === '-' ? null : item.coo,
        country_of_origin_name: item.coo_name === '-' ? null : item.coo_name,
        country_of_asylum: item.coa === '-' ? null : item.coa,
        country_of_asylum_name: item.coa_name === '-' ? null : item.coa_name,
        procedure_type: item.procedure_type,
        decision_level: item.dec_level,
        decision_category: item.dec_pc,
        recognized: this.toNum(item.dec_recognized),
        other_positive: this.toNum(item.dec_other),
        rejected: this.toNum(item.dec_rejected),
        closed: this.toNum(item.dec_closed),
        total_decisions: this.toNum(item.dec_total),
      })),
    };
  }
}
