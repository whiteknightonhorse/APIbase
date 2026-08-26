import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { NsfAwardsApiResponse, NsfAwardRaw } from './types';

const NSF_AWARDS_BASE = 'https://api.nsf.gov';

/**
 * NSF Awards Search API adapter (UC-610).
 *
 * Supported tools (read-only):
 *   nsf-awards.search        → GET /services/v1/awards.json
 *   nsf-awards.award_detail  → GET /services/v1/awards.json?id={id}
 *
 * Auth: None (US Government open data, public domain — National Science Foundation).
 *
 * Upstream quirk: `printFields` is silently ignored — every response includes ALL ~50
 * fields (including a multi-KB `abstractText`), regardless of what is requested. Search
 * results are therefore trimmed to a condensed field set server-side (abstract truncated
 * to 300 chars); the full abstract is only returned by award_detail.
 */
export class NsfAwardsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'nsf-awards',
      baseUrl: NSF_AWARDS_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'nsf-awards.search':
        return this.buildSearchRequest(params, headers);
      case 'nsf-awards.award_detail':
        return this.buildAwardDetailRequest(params, headers);
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
    const data = raw.body as unknown as NsfAwardsApiResponse;
    const notification = data.response?.serviceNotification?.[0];
    if (notification) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `NSF Awards API rejected the request: ${notification.notificationMessage}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    switch (req.toolId) {
      case 'nsf-awards.search': {
        const awards = data.response?.award ?? [];
        return {
          total_count: data.response?.metadata?.totalCount ?? 0,
          returned_count: awards.length,
          awards: awards.map((a) => this.toSummary(a)),
        };
      }
      case 'nsf-awards.award_detail': {
        const award = data.response?.award?.[0];
        if (!award) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `No NSF award found for the given id`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return this.toDetail(award);
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.keyword) qs.set('keyword', String(params.keyword));
    if (params.awardeeName) qs.set('awardeeName', String(params.awardeeName));
    if (params.awardeeStateCode) qs.set('awardeeStateCode', String(params.awardeeStateCode));
    if (params.cfdaNumber) qs.set('cfdaNumber', String(params.cfdaNumber));
    if (params.dateStart) qs.set('dateStart', String(params.dateStart));
    if (params.dateEnd) qs.set('dateEnd', String(params.dateEnd));
    const rpp = Math.min(Math.max(Number(params.rpp ?? 10), 1), 25);
    qs.set('rpp', String(rpp));

    return {
      url: `${this.baseUrl}/services/v1/awards.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildAwardDetailRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = encodeURIComponent(String(params.id ?? ''));
    return {
      url: `${this.baseUrl}/services/v1/awards.json?id=${id}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response shaping
  // ---------------------------------------------------------------------------

  private toSummary(a: NsfAwardRaw): Record<string, unknown> {
    const abstract = a.abstractText ?? '';
    return {
      id: a.id,
      title: a.title,
      awardee_name: a.awardeeName,
      awardee_state: a.awardeeStateCode,
      pi_name: [a.piFirstName, a.piLastName].filter(Boolean).join(' ') || undefined,
      start_date: a.startDate,
      exp_date: a.expDate,
      funds_obligated_usd: a.fundsObligatedAmt,
      program: a.program ?? a.fundProgramName,
      award_type: a.transType,
      abstract_excerpt:
        abstract.length > 300 ? `${abstract.slice(0, 300).trimEnd()}...` : abstract || undefined,
    };
  }

  private toDetail(a: NsfAwardRaw): Record<string, unknown> {
    return {
      id: a.id,
      title: a.title,
      abstract: a.abstractText,
      awardee_name: a.awardeeName,
      awardee_city: a.awardeeCity,
      awardee_state: a.awardeeStateCode,
      awardee_country: a.awardeeCountryCode,
      pi_name: [a.piFirstName, a.piLastName].filter(Boolean).join(' ') || undefined,
      pi_email: a.piEmail,
      co_pi: a.coPDPI,
      program_officer: a.poName,
      program_officer_email: a.poEmail,
      start_date: a.startDate,
      exp_date: a.expDate,
      award_date: a.date,
      estimated_total_usd: a.estimatedTotalAmt,
      funds_obligated_usd: a.fundsObligatedAmt,
      funds_obligated_by_year: a.fundsObligated,
      program: a.program ?? a.fundProgramName,
      cfda_number: a.cfdaNumber,
      directorate: a.orgLongName,
      division: a.orgLongName2,
      award_type: a.transType,
      active: a.activeAwd === 'true',
      public_access_mandate: a.publicAccessMandate === '1',
      uei_number: a.ueiNumber,
      org_url: a.orgUrl,
    };
  }
}
