import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class ClinicalTrialsAdapter extends BaseAdapter {
  constructor() {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://clinicaltrials.gov/api/v2';

    switch (req.toolId) {
      case 'clinical.search': {
        const qs = new URLSearchParams();
        if (params.query) qs.set('query.term', String(params.query));
        if (params.condition) qs.set('query.cond', String(params.condition));
        if (params.intervention) qs.set('query.intr', String(params.intervention));
        if (params.status) qs.set('filter.overallStatus', String(params.status));
        qs.set('pageSize', String(params.limit ?? 10));
        qs.set('fields', 'NCTId,BriefTitle,OverallStatus,Condition,InterventionName,LeadSponsorName,EnrollmentCount,StartDate,CompletionDate,Phase,StudyType');
        return { url: `${base}/studies?${qs}`, method: 'GET', headers: {} };
      }

      case 'clinical.study': {
        const nctId = String(params.nct_id ?? '');
        return { url: `${base}/studies/${nctId}`, method: 'GET', headers: {} };
      }

      case 'clinical.stats': {
        return { url: `${base}/stats/size`, method: 'GET', headers: {} };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body = typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (req.toolId === 'clinical.search') {
      const studies = (body.studies ?? []).map((s: Record<string, unknown>) => {
        const p = s.protocolSection as Record<string, unknown> | undefined;
        const id = p?.identificationModule as Record<string, unknown> | undefined;
        const status = p?.statusModule as Record<string, unknown> | undefined;
        const conditions = p?.conditionsModule as Record<string, unknown> | undefined;
        const arms = p?.armsInterventionsModule as Record<string, unknown> | undefined;
        const sponsor = p?.sponsorCollaboratorsModule as Record<string, unknown> | undefined;
        const design = p?.designModule as Record<string, unknown> | undefined;
        const leadSponsor = sponsor?.leadSponsor as Record<string, unknown> | undefined;
        const enroll = design?.enrollmentInfo as Record<string, unknown> | undefined;

        return {
          nct_id: id?.nctId,
          title: id?.briefTitle,
          status: status?.overallStatus,
          conditions: (conditions?.conditions as string[]) ?? [],
          interventions: ((arms?.interventions as Array<Record<string, unknown>>) ?? []).map(i => i.name),
          sponsor: leadSponsor?.name,
          enrollment: enroll?.count,
          phase: (design?.phases as string[]) ?? [],
          study_type: design?.studyType,
          start_date: (status?.startDateStruct as Record<string, unknown>)?.date,
          completion_date: (status?.completionDateStruct as Record<string, unknown>)?.date,
        };
      });
      return { ...raw, body: { studies, count: studies.length, total: body.totalCount ?? studies.length } };
    }

    if (req.toolId === 'clinical.study') {
      const p = body.protocolSection as Record<string, unknown> | undefined;
      if (!p) return { ...raw, status: 404, body: { error: 'Study not found' } };

      const id = p.identificationModule as Record<string, unknown>;
      const status = p.statusModule as Record<string, unknown>;
      const desc = p.descriptionModule as Record<string, unknown> | undefined;
      const conditions = p.conditionsModule as Record<string, unknown> | undefined;
      const arms = p.armsInterventionsModule as Record<string, unknown> | undefined;
      const sponsor = p.sponsorCollaboratorsModule as Record<string, unknown> | undefined;
      const design = p.designModule as Record<string, unknown> | undefined;
      const eligibility = p.eligibilityModule as Record<string, unknown> | undefined;
      const outcomes = p.outcomesModule as Record<string, unknown> | undefined;
      const leadSponsor = (sponsor?.leadSponsor as Record<string, unknown>) ?? {};
      const enroll = (design?.enrollmentInfo as Record<string, unknown>) ?? {};

      return {
        ...raw,
        body: {
          nct_id: id?.nctId,
          title: id?.briefTitle,
          official_title: id?.officialTitle,
          status: (status as Record<string, unknown>)?.overallStatus,
          conditions: (conditions?.conditions as string[]) ?? [],
          interventions: ((arms?.interventions as Array<Record<string, unknown>>) ?? []).map(i => ({
            name: i.name, type: i.type, description: String(i.description ?? '').slice(0, 300),
          })),
          sponsor: leadSponsor.name,
          sponsor_class: leadSponsor.class,
          enrollment: enroll.count,
          phase: (design?.phases as string[]) ?? [],
          study_type: design?.studyType,
          brief_summary: String(desc?.briefSummary ?? '').slice(0, 1000),
          eligibility: {
            criteria: String(eligibility?.eligibilityCriteria ?? '').slice(0, 500),
            sex: eligibility?.sex,
            min_age: eligibility?.minimumAge,
            max_age: eligibility?.maximumAge,
          },
          primary_outcomes: ((outcomes?.primaryOutcomes as Array<Record<string, unknown>>) ?? []).map(o => ({
            measure: o.measure, time_frame: o.timeFrame,
          })),
          start_date: ((status as Record<string, unknown>)?.startDateStruct as Record<string, unknown>)?.date,
          completion_date: ((status as Record<string, unknown>)?.completionDateStruct as Record<string, unknown>)?.date,
        },
      };
    }

    if (req.toolId === 'clinical.stats') {
      return { ...raw, body: { total_studies: body.totalStudies } };
    }

    return raw;
  }
}
