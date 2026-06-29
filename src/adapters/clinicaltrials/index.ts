import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CtSearchResponse, CtStudy, CtStatsResponse, CtProtocolSection } from './types';

/**
 * ClinicalTrials.gov v2 API adapter (UC-531).
 *
 * Supported tools:
 *   clinicaltrials.search     → GET /api/v2/studies (multi-field search)
 *   clinicaltrials.study      → GET /api/v2/studies/{nctId} (full study record)
 *   clinicaltrials.recruiting → GET /api/v2/studies (recruiting filter + condition)
 *   clinicaltrials.stats      → GET /api/v2/stats/size (database statistics)
 *
 * Auth: None (US Gov NIH, public domain, unlimited).
 */
export class ClinicalTrialsAdapter extends BaseAdapter {
  private static readonly BASE = 'https://clinicaltrials.gov/api/v2';

  constructor() {
    super({
      provider: 'clinicaltrials',
      baseUrl: 'https://clinicaltrials.gov',
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
      case 'clinicaltrials.search':
        return this.buildSearch(params, headers);
      case 'clinicaltrials.study':
        return this.buildStudy(params, headers);
      case 'clinicaltrials.recruiting':
        return this.buildRecruiting(params, headers);
      case 'clinicaltrials.stats':
        return {
          url: `${ClinicalTrialsAdapter.BASE}/stats/size`,
          method: 'GET',
          headers,
        };
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
      case 'clinicaltrials.search':
      case 'clinicaltrials.recruiting':
        return this.parseSearchResponse(body as unknown as CtSearchResponse);
      case 'clinicaltrials.study':
        return this.parseStudyResponse(body as unknown as CtStudy);
      case 'clinicaltrials.stats':
        return this.parseStatsResponse(body as unknown as CtStatsResponse);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();

    if (params.condition) qs.set('query.cond', String(params.condition));
    if (params.intervention) qs.set('query.intr', String(params.intervention));
    if (params.sponsor) qs.set('query.spons', String(params.sponsor));
    if (params.keyword) qs.set('query.term', String(params.keyword));
    if (params.status) qs.set('filter.overallStatus', String(params.status).toUpperCase());
    if (params.phase) {
      qs.set('filter.phase', String(params.phase).toUpperCase().replace(/ /g, '_'));
    }

    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50);
    qs.set('pageSize', String(limit));
    qs.set(
      'fields',
      'NCTId,BriefTitle,OverallStatus,Phase,Condition,LeadSponsorName,StartDate,CompletionDate,StudyType,EnrollmentCount',
    );

    if (params.page_token) qs.set('pageToken', String(params.page_token));

    return {
      url: `${ClinicalTrialsAdapter.BASE}/studies?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildStudy(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const nctId = String(params.nct_id ?? '')
      .trim()
      .toUpperCase();
    if (!nctId || !nctId.startsWith('NCT')) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'nct_id must be a valid NCT identifier starting with "NCT" (e.g. "NCT04368728")',
        provider: this.provider,
        toolId: 'clinicaltrials.study',
        durationMs: 0,
      };
    }
    return {
      url: `${ClinicalTrialsAdapter.BASE}/studies/${encodeURIComponent(nctId)}`,
      method: 'GET',
      headers,
    };
  }

  private buildRecruiting(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();

    if (params.condition) qs.set('query.cond', String(params.condition));
    if (params.intervention) qs.set('query.intr', String(params.intervention));
    qs.set('filter.overallStatus', 'RECRUITING');
    if (params.phase) {
      qs.set('filter.phase', String(params.phase).toUpperCase().replace(/ /g, '_'));
    }

    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50);
    qs.set('pageSize', String(limit));
    qs.set(
      'fields',
      'NCTId,BriefTitle,OverallStatus,Phase,Condition,LeadSponsorName,StartDate,CompletionDate,EnrollmentCount',
    );

    return {
      url: `${ClinicalTrialsAdapter.BASE}/studies?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseSearchResponse(data: CtSearchResponse): unknown {
    const studies = (data.studies ?? []).map((s) => this.summarizeStudy(s));
    return {
      total_count: data.totalCount ?? studies.length,
      next_page_token: data.nextPageToken ?? null,
      studies,
    };
  }

  private parseStudyResponse(data: CtStudy): unknown {
    const p = data.protocolSection ?? ({} as CtProtocolSection);
    const id = p.identificationModule;
    const status = p.statusModule;
    const sponsor = p.sponsorCollaboratorsModule;
    const desc = p.descriptionModule;
    const cond = p.conditionsModule;
    const design = p.designModule;
    const arms = p.armsInterventionsModule;
    const outcomes = p.outcomesModule;
    const eligibility = p.eligibilityModule;
    const contacts = p.contactsLocationsModule;

    return {
      nct_id: id?.nctId ?? '',
      title: id?.briefTitle ?? '',
      official_title: id?.officialTitle ?? null,
      status: status?.overallStatus ?? '',
      start_date: status?.startDateStruct?.date ?? null,
      completion_date: status?.completionDateStruct?.date ?? null,
      sponsor: sponsor?.leadSponsor?.name ?? '',
      sponsor_class: sponsor?.leadSponsor?.class ?? '',
      collaborators: (sponsor?.collaborators ?? []).map((c) => c.name ?? ''),
      conditions: cond?.conditions ?? [],
      keywords: cond?.keywords ?? [],
      phases: design?.phases ?? [],
      study_type: design?.studyType ?? '',
      design: design?.designInfo
        ? {
            allocation: design.designInfo.allocation ?? null,
            intervention_model: design.designInfo.interventionModel ?? null,
            primary_purpose: design.designInfo.primaryPurpose ?? null,
            masking: design.designInfo.maskingInfo?.masking ?? null,
          }
        : null,
      enrollment: design?.enrollmentInfo?.count ?? null,
      brief_summary: String(desc?.briefSummary ?? '').slice(0, 1000),
      interventions: (arms?.interventions ?? []).map((i) => ({
        type: i.type ?? '',
        name: i.name ?? '',
        description: String(i.description ?? '').slice(0, 300),
      })),
      primary_outcomes: (outcomes?.primaryOutcomes ?? []).map((o) => ({
        measure: o.measure ?? '',
        time_frame: o.timeFrame ?? null,
      })),
      secondary_outcomes: (outcomes?.secondaryOutcomes ?? []).slice(0, 5).map((o) => ({
        measure: o.measure ?? '',
        time_frame: o.timeFrame ?? null,
      })),
      eligibility: {
        criteria: String(eligibility?.eligibilityCriteria ?? '').slice(0, 500),
        healthy_volunteers: eligibility?.healthyVolunteers ?? null,
        sex: eligibility?.sex ?? null,
        min_age: eligibility?.minimumAge ?? null,
        max_age: eligibility?.maximumAge ?? null,
        std_ages: eligibility?.stdAges ?? [],
      },
      locations: (contacts?.locations ?? []).slice(0, 10).map((l) => ({
        facility: l.facility ?? null,
        city: l.city ?? null,
        state: l.state ?? null,
        country: l.country ?? null,
      })),
      has_results: data.hasResults ?? false,
    };
  }

  private parseStatsResponse(data: CtStatsResponse): unknown {
    return {
      total_studies: data.totalStudies ?? 0,
      average_size_bytes: data.averageSizeBytes ?? 0,
    };
  }

  private summarizeStudy(s: { protocolSection?: CtProtocolSection }): unknown {
    const p = s.protocolSection;
    return {
      nct_id: p?.identificationModule?.nctId ?? '',
      title: p?.identificationModule?.briefTitle ?? '',
      status: p?.statusModule?.overallStatus ?? '',
      phases: p?.designModule?.phases ?? [],
      conditions: p?.conditionsModule?.conditions ?? [],
      sponsor: p?.sponsorCollaboratorsModule?.leadSponsor?.name ?? '',
      start_date: p?.statusModule?.startDateStruct?.date ?? null,
      completion_date: p?.statusModule?.completionDateStruct?.date ?? null,
      enrollment: p?.designModule?.enrollmentInfo?.count ?? null,
    };
  }
}
