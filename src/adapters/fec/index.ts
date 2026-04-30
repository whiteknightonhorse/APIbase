import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * US Federal Election Commission adapter (UC-408).
 * Campaign finance: candidates, committee totals, Super PAC spending, donor lookup.
 * Free via api.data.gov shared key (1,000 req/hr).
 */
export class FecAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'fec', baseUrl: 'https://api.open.fec.gov', maxResponseBytes: 2_000_000 });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const perPage = Math.max(1, Math.min(100, Number(p.per_page ?? 20)));

    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    qs.set('per_page', String(perPage));
    if (p.page) qs.set('page', String(p.page));

    switch (req.toolId) {
      case 'fec.candidates': {
        if (p.q) qs.set('q', String(p.q));
        if (p.cycle) qs.append('cycle', String(p.cycle));
        if (p.office) qs.append('office', String(p.office));
        if (p.state) qs.append('state', String(p.state).toUpperCase());
        if (p.party) qs.append('party', String(p.party));
        return { url: `${this.baseUrl}/v1/candidates/?${qs.toString()}`, method: 'GET', headers };
      }
      case 'fec.committee_totals': {
        if (p.cycle) qs.append('cycle', String(p.cycle));
        if (p.committee_type) qs.append('committee_type', String(p.committee_type));
        return { url: `${this.baseUrl}/v1/totals/?${qs.toString()}`, method: 'GET', headers };
      }
      case 'fec.super_pac_spending': {
        if (p.cycle) qs.append('cycle', String(p.cycle));
        if (p.candidate_id) qs.append('candidate_id', String(p.candidate_id));
        if (p.support_oppose) qs.append('support_oppose_indicator', String(p.support_oppose));
        return {
          url: `${this.baseUrl}/v1/schedules/schedule_e/?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'fec.elections': {
        if (p.cycle) qs.append('cycle', String(p.cycle));
        if (p.office) qs.append('office', String(p.office));
        if (p.state) qs.append('state', String(p.state).toUpperCase());
        return { url: `${this.baseUrl}/v1/elections/?${qs.toString()}`, method: 'GET', headers };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const results = (body.results as Array<Record<string, unknown>>) ?? [];
    const pagination = (body.pagination as Record<string, unknown>) ?? {};

    const summary = {
      total: pagination.count,
      page: pagination.page,
      pages: pagination.pages,
      per_page: pagination.per_page,
    };

    if (req.toolId === 'fec.candidates') {
      return {
        ...summary,
        candidates: results.map((c) => ({
          candidate_id: c.candidate_id,
          name: c.name,
          party: c.party,
          office: c.office,
          state: c.state,
          district: c.district,
          incumbent_challenge: c.incumbent_challenge_full,
          election_years: c.election_years,
          first_file_date: c.first_file_date,
          last_file_date: c.last_file_date,
        })),
      };
    }

    if (req.toolId === 'fec.committee_totals') {
      return {
        ...summary,
        totals: results.map((c) => ({
          committee_id: c.committee_id,
          committee_name: c.committee_name,
          cycle: c.cycle,
          receipts: c.receipts,
          disbursements: c.disbursements,
          cash_on_hand_end_period: c.last_cash_on_hand_end_period,
          coverage_start_date: c.coverage_start_date,
          coverage_end_date: c.coverage_end_date,
        })),
      };
    }

    if (req.toolId === 'fec.super_pac_spending') {
      return {
        ...summary,
        expenditures: results.slice(0, 100).map((e) => ({
          spender: e.committee_name,
          spender_id: e.committee_id,
          target_candidate: e.candidate_name,
          candidate_id: e.candidate_id,
          amount: e.expenditure_amount,
          date: e.expenditure_date,
          purpose: e.expenditure_description,
          support_oppose: e.support_oppose_indicator,
        })),
      };
    }

    if (req.toolId === 'fec.elections') {
      return {
        ...summary,
        elections: results.map((e) => ({
          cycle: e.cycle,
          office: e.office,
          state: e.state,
          district: e.district,
          total_receipts: e.total_receipts,
          total_disbursements: e.total_disbursements,
          number_of_candidates: e.number_of_candidates,
        })),
      };
    }

    return body;
  }
}
