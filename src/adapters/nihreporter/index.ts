import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { NihProjectsResponse, NihPublicationsResponse } from './types';

const API_BASE = 'https://api.reporter.nih.gov/v2';

/**
 * NIH Reporter adapter (UC-454).
 *
 * Supported tools (read-only):
 *   nihreporter.projects.search       — full-text keyword search across NIH grants
 *   nihreporter.projects.by_org       — grants by institution/organization name
 *   nihreporter.projects.by_pi        — grants by principal investigator last name
 *   nihreporter.publications.by_project — PMIDs linked to an NIH core project number
 *
 * Auth: None (US Government open data, unlimited, public domain).
 * API: POST-based search endpoints.
 */
export class NihReporterAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'nihreporter',
      baseUrl: API_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'nihreporter.projects.search':
        return this.buildProjectKeywordSearch(params, headers);
      case 'nihreporter.projects.by_org':
        return this.buildProjectByOrgSearch(params, headers);
      case 'nihreporter.projects.by_pi':
        return this.buildProjectByPiSearch(params, headers);
      case 'nihreporter.publications.by_project':
        return this.buildPublicationsByProject(params, headers);
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
      case 'nihreporter.projects.search':
      case 'nihreporter.projects.by_org':
      case 'nihreporter.projects.by_pi': {
        const data = body as unknown as NihProjectsResponse;
        return {
          total: data.meta?.total ?? 0,
          offset: data.meta?.offset ?? 0,
          limit: data.meta?.limit ?? 10,
          projects: (data.results ?? []).map((p) => ({
            appl_id: p.appl_id,
            project_num: p.project_num,
            core_project_num: p.core_project_num,
            title: p.project_title,
            pi_name: p.contact_pi_name,
            principal_investigators: (p.principal_investigators ?? []).map((pi) => ({
              name: pi.full_name ?? `${pi.first_name ?? ''} ${pi.last_name ?? ''}`.trim(),
              is_contact_pi: pi.is_contact_pi,
            })),
            organization: p.organization?.org_name ?? null,
            city: p.organization?.org_city ?? null,
            state: p.organization?.org_state ?? null,
            country: p.organization?.org_country ?? null,
            fiscal_year: p.fiscal_year,
            award_amount: p.award_amount,
            direct_cost: p.direct_cost_amt,
            indirect_cost: p.indirect_cost_amt,
            activity_code: p.activity_code,
            agency_code: p.agency_code,
            funding_mechanism: p.funding_mechanism,
            is_active: p.is_active,
            project_start: p.project_start_date,
            project_end: p.project_end_date,
            abstract: p.abstract_text ? p.abstract_text.slice(0, 500) : null,
            detail_url: p.project_detail_url,
          })),
        };
      }

      case 'nihreporter.publications.by_project': {
        const data = body as unknown as NihPublicationsResponse;
        return {
          total: data.meta?.total ?? 0,
          offset: data.meta?.offset ?? 0,
          limit: data.meta?.limit ?? 50,
          publications: (data.results ?? []).map((pub) => ({
            pmid: pub.pmid,
            core_project_num: pub.coreproject,
            appl_id: pub.applid,
            pubmed_url: `https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}/`,
          })),
        };
      }

      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildProjectKeywordSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const keyword = String(params.keyword ?? '');
    const limit = Math.min(Number(params.limit) || 10, 25);
    const offset = Number(params.offset) || 0;
    const isActive = params.is_active === true || params.is_active === 'true';

    const criteria: Record<string, unknown> = {
      advanced_text_search: {
        operator: 'and',
        search_field: 'all',
        search_text: keyword,
      },
    };

    if (params.fiscal_year) criteria.fiscal_years = [Number(params.fiscal_year)];
    if (params.agency) criteria.agencies = [String(params.agency).toUpperCase()];
    if (isActive) criteria.is_active = true;

    return {
      url: `${API_BASE}/projects/search`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        criteria,
        // omit include_fields — NIH Reporter returns all fields by default
        offset,
        limit,
        sort_field: 'award_amount',
        sort_order: 'desc',
      }),
    };
  }

  private buildProjectByOrgSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const orgName = String(params.org_name ?? '');
    const limit = Math.min(Number(params.limit) || 10, 25);
    const offset = Number(params.offset) || 0;

    const criteria: Record<string, unknown> = {
      org_names: [orgName.toUpperCase()],
    };

    if (params.fiscal_year) criteria.fiscal_years = [Number(params.fiscal_year)];
    if (params.is_active === true || params.is_active === 'true') criteria.is_active = true;

    return {
      url: `${API_BASE}/projects/search`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        criteria,
        // omit include_fields — NIH Reporter returns all fields by default
        offset,
        limit,
        sort_field: 'award_amount',
        sort_order: 'desc',
      }),
    };
  }

  private buildProjectByPiSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const lastName = String(params.last_name ?? '');
    const limit = Math.min(Number(params.limit) || 10, 25);
    const offset = Number(params.offset) || 0;

    const piEntry: Record<string, string> = { last_name: lastName.toUpperCase() };
    if (params.first_name) piEntry.first_name = String(params.first_name).toUpperCase();

    const criteria: Record<string, unknown> = {
      pi_names: [piEntry],
    };

    if (params.fiscal_year) criteria.fiscal_years = [Number(params.fiscal_year)];
    if (params.is_active === true || params.is_active === 'true') criteria.is_active = true;

    return {
      url: `${API_BASE}/projects/search`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        criteria,
        // omit include_fields — NIH Reporter returns all fields by default
        offset,
        limit,
        sort_field: 'award_amount',
        sort_order: 'desc',
      }),
    };
  }

  private buildPublicationsByProject(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const projectNum = String(params.core_project_num ?? '');
    const limit = Math.min(Number(params.limit) || 50, 100);
    const offset = Number(params.offset) || 0;

    return {
      url: `${API_BASE}/publications/search`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        criteria: {
          core_project_nums: [projectNum.toUpperCase()],
        },
        offset,
        limit,
      }),
    };
  }
}
