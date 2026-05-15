import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { UsajobsSearchEnvelope, UsajobsCodeList } from './types';

const USAJOBS_BASE = 'https://data.usajobs.gov/api';

/**
 * Registered email associated with the USAJOBS API key.
 * Must match the email used to register the key at developer.usajobs.gov.
 * This is NOT a secret — it is the User-Agent header value required by USAJOBS.
 */
const USER_AGENT_EMAIL = 'whiteknightonhorse@gmail.com';

/**
 * USAJOBS — Office of Personnel Management adapter (UC-415).
 *
 * Supported tools:
 *   usajobs.search          → GET /api/search?Keyword=...
 *   usajobs.position_detail → GET /api/search?ControlNumber=...
 *   usajobs.code_lists      → GET /api/codelist/{name}
 *
 * Auth: Authorization-Key header (API key) + User-Agent (registered email).
 * License: US Federal public information, commercial use OK.
 * URL-encode all string query params per flywheel [2026-04-05].
 */
export class UsajobsAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'usajobs',
      baseUrl: USAJOBS_BASE,
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'Authorization-Key': this.apiKey,
      'User-Agent': USER_AGENT_EMAIL,
      Host: 'data.usajobs.gov',
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'usajobs.search': {
        const qp = new URLSearchParams();
        // URLSearchParams.set() encodes values automatically — do NOT double-encode.
        if (params.keyword) qp.set('Keyword', String(params.keyword));
        if (params.location_name) qp.set('LocationName', String(params.location_name));
        if (params.pay_grade_low) qp.set('PayGradeLow', String(params.pay_grade_low));
        if (params.pay_grade_high) qp.set('PayGradeHigh', String(params.pay_grade_high));
        if (params.organization) qp.set('Organization', String(params.organization));
        if (params.position_title) qp.set('PositionTitle', String(params.position_title));
        const n = params.results_per_page != null ? Number(params.results_per_page) : 25;
        qp.set('ResultsPerPage', String(Math.min(Math.max(1, n), 500)));
        const p = params.page != null ? Number(params.page) : 1;
        qp.set('Page', String(Math.min(Math.max(1, p), 100)));
        return { url: `${USAJOBS_BASE}/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'usajobs.position_detail': {
        const qp = new URLSearchParams();
        qp.set('ControlNumber', String(params.control_number));
        return { url: `${USAJOBS_BASE}/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'usajobs.code_lists': {
        const codeList = String(params.code_list);
        // code_list is a validated enum — safe to use directly in path.
        return { url: `${USAJOBS_BASE}/codelist/${codeList}`, method: 'GET', headers };
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
    switch (req.toolId) {
      case 'usajobs.search':
        return this.parseSearch(raw.body as UsajobsSearchEnvelope);
      case 'usajobs.position_detail':
        return this.parsePositionDetail(raw.body as UsajobsSearchEnvelope);
      case 'usajobs.code_lists':
        return this.parseCodeList(raw.body as UsajobsCodeList);
      default:
        return raw.body;
    }
  }

  private parseSearch(envelope: UsajobsSearchEnvelope) {
    const result = envelope.SearchResult;
    return {
      total_count: result.SearchResultCountAll,
      returned_count: result.SearchResultCount,
      jobs: (result.SearchResultItems ?? []).map((item) => {
        const d = item.MatchedObjectDescriptor;
        const rem = (d.PositionRemuneration ?? [])[0];
        const details = d.UserArea?.Details;
        return {
          control_number: item.MatchedObjectId,
          position_title: d.PositionTitle,
          organization: d.OrganizationName,
          department: d.DepartmentName,
          location: d.PositionLocationDisplay,
          salary_min: rem?.MinimumRange ?? null,
          salary_max: rem?.MaximumRange ?? null,
          salary_description: rem?.Description ?? null,
          pay_grade_low: details?.LowGrade ?? null,
          pay_grade_high: details?.HighGrade ?? null,
          open_date: d.PublicationStartDate,
          close_date: d.ApplicationCloseDate,
          who_may_apply: details?.WhoMayApply?.Name ?? null,
          security_clearance: details?.SecurityClearance ?? null,
          telework_eligible: details?.TeleworkEligible ?? null,
          remote: details?.RemoteIndicator ?? null,
          job_summary: details?.JobSummary ?? null,
          apply_url: (d.ApplyURI ?? [])[0] ?? d.PositionURI,
          position_uri: d.PositionURI,
        };
      }),
    };
  }

  private parsePositionDetail(envelope: UsajobsSearchEnvelope) {
    const result = envelope.SearchResult;
    if (!result.SearchResultItems || result.SearchResultItems.length === 0) {
      return { found: false, job: null };
    }
    const item = result.SearchResultItems[0];
    const d = item.MatchedObjectDescriptor;
    const rem = (d.PositionRemuneration ?? [])[0];
    const details = d.UserArea?.Details;
    // Extract full description from PositionFormattedDescription
    const fullDesc =
      (d.PositionFormattedDescription ?? [])
        .map((f) => f.Content)
        .join('\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() ||
      details?.JobSummary ||
      null;

    return {
      found: true,
      job: {
        control_number: item.MatchedObjectId,
        position_title: d.PositionTitle,
        organization: d.OrganizationName,
        department: d.DepartmentName,
        locations: (d.PositionLocation ?? []).map((l) => ({
          name: l.LocationName,
          city: l.CityName,
          state: l.CountrySubDivisionCode,
        })),
        salary_min: rem?.MinimumRange ?? null,
        salary_max: rem?.MaximumRange ?? null,
        salary_description: rem?.Description ?? null,
        pay_grade_low: details?.LowGrade ?? null,
        pay_grade_high: details?.HighGrade ?? null,
        promotion_potential: details?.PromotionPotential ?? null,
        open_date: d.PublicationStartDate,
        close_date: d.ApplicationCloseDate,
        who_may_apply: details?.WhoMayApply?.Name ?? null,
        hiring_path: details?.HiringPath ?? [],
        security_clearance: details?.SecurityClearance ?? null,
        drug_test: details?.DrugTestRequired ?? null,
        telework_eligible: details?.TeleworkEligible ?? null,
        remote: details?.RemoteIndicator ?? null,
        total_openings: details?.TotalOpenings ?? null,
        job_summary: details?.JobSummary ?? null,
        full_description: fullDesc,
        qualification_summary: d.QualificationSummary ?? null,
        job_categories: (d.JobCategory ?? []).map((c) => c.Name),
        apply_url: (d.ApplyURI ?? [])[0] ?? d.PositionURI,
        position_uri: d.PositionURI,
      },
    };
  }

  private parseCodeList(data: UsajobsCodeList) {
    const list = (data.CodeList ?? [])[0];
    return {
      date_generated: data.DateGenerated,
      status: data.Status,
      codelist_id: list?.id ?? null,
      items: (list?.ValidValue ?? []).map((v) => ({
        code: v.Code,
        value: v.Value,
        parent_code: v.ParentCode ?? null,
      })),
      total: list?.ValidValue?.length ?? 0,
    };
  }
}
