import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OpenStatesPeopleResponse,
  OpenStateBillsResponse,
  OpenStatesBillDetail,
  OpenStatesCommitteesResponse,
} from './types';

/**
 * OpenStates v3 adapter (UC-498).
 *
 * Supported tools:
 *   openstates.people_search     → GET /people
 *   openstates.bills_search      → GET /bills
 *   openstates.bill_detail       → GET /bills/{jurisdiction}/{session}/{bill_id}
 *   openstates.committees        → GET /committees
 *
 * Auth: X-API-Key header.
 * Limits: 500 req/day, 10 req/min.
 */
export class OpenstatesAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'openstates',
      baseUrl: 'https://v3.openstates.org',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-API-Key': this.apiKey,
    };

    switch (req.toolId) {
      case 'openstates.people_search':
        return this.buildPeopleSearchRequest(params, headers);
      case 'openstates.bills_search':
        return this.buildBillsSearchRequest(params, headers);
      case 'openstates.bill_detail':
        return this.buildBillDetailRequest(params, headers);
      case 'openstates.committees':
        return this.buildCommitteesRequest(params, headers);
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

  private buildPeopleSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const qs = new URLSearchParams();
    if (params.jurisdiction) qs.set('jurisdiction', String(params.jurisdiction));
    if (params.name) qs.set('name', String(params.name));
    if (params.party) qs.set('party', String(params.party));
    if (params.district) qs.set('district', String(params.district));
    qs.set('per_page', String(params.per_page ?? 20));
    qs.set('page', String(params.page ?? 1));
    return { url: `${this.baseUrl}/people?${qs}`, method: 'GET', headers };
  }

  private buildBillsSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const qs = new URLSearchParams();
    if (params.jurisdiction) qs.set('jurisdiction', String(params.jurisdiction));
    if (params.q) qs.set('q', String(params.q));
    if (params.session) qs.set('session', String(params.session));
    if (params.classification) qs.set('classification', String(params.classification));
    if (params.subject) qs.set('subject', String(params.subject));
    qs.set('per_page', String(params.per_page ?? 20));
    qs.set('page', String(params.page ?? 1));
    return { url: `${this.baseUrl}/bills?${qs}`, method: 'GET', headers };
  }

  private buildBillDetailRequest(params: Record<string, unknown>, headers: Record<string, string>) {
    const jurisdiction = encodeURIComponent(String(params.jurisdiction ?? ''));
    const session = encodeURIComponent(String(params.session ?? ''));
    const billId = encodeURIComponent(String(params.bill_id ?? ''));
    const qs = new URLSearchParams({
      include: 'actions',
    });
    // Append additional include params (enum: sponsorships, abstracts, actions, votes, sources, documents, versions)
    qs.append('include', 'sponsorships');
    qs.append('include', 'abstracts');
    qs.append('include', 'votes');
    return {
      url: `${this.baseUrl}/bills/${jurisdiction}/${session}/${billId}?${qs}`,
      method: 'GET',
      headers,
    };
  }

  private buildCommitteesRequest(params: Record<string, unknown>, headers: Record<string, string>) {
    const qs = new URLSearchParams();
    if (params.jurisdiction) qs.set('jurisdiction', String(params.jurisdiction));
    if (params.chamber) qs.set('chamber', String(params.chamber));
    if (params.classification) qs.set('classification', String(params.classification));
    qs.set('per_page', String(params.per_page ?? 20));
    qs.set('page', String(params.page ?? 1));
    return { url: `${this.baseUrl}/committees?${qs}`, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body;

    switch (req.toolId) {
      case 'openstates.people_search': {
        const data = body as OpenStatesPeopleResponse;
        if (!Array.isArray(data.results)) {
          throw new Error('Missing results array in people response');
        }
        return {
          results: data.results.map((p) => ({
            id: p.id,
            name: p.name,
            given_name: p.given_name,
            family_name: p.family_name,
            party: p.party,
            current_role: p.current_role,
            jurisdiction: p.jurisdiction,
            image: p.image,
            email: p.email,
            openstates_url: p.openstates_url,
          })),
          pagination: data.pagination,
        };
      }

      case 'openstates.bills_search': {
        const data = body as OpenStateBillsResponse;
        if (!Array.isArray(data.results)) {
          throw new Error('Missing results array in bills response');
        }
        return {
          results: data.results.map((b) => ({
            id: b.id,
            identifier: b.identifier,
            title: b.title,
            session: b.session,
            jurisdiction: b.jurisdiction,
            classification: b.classification,
            subject: b.subject,
            first_action_date: b.first_action_date,
            latest_action_date: b.latest_action_date,
            latest_action_description: b.latest_action_description,
            latest_passage_date: b.latest_passage_date,
            openstates_url: b.openstates_url,
          })),
          pagination: data.pagination,
        };
      }

      case 'openstates.bill_detail': {
        const data = body as OpenStatesBillDetail;
        if (!data.id) {
          throw new Error('Missing id in bill detail response');
        }
        return {
          id: data.id,
          identifier: data.identifier,
          title: data.title,
          session: data.session,
          jurisdiction: data.jurisdiction,
          classification: data.classification,
          subject: data.subject,
          abstracts: data.abstracts,
          actions: data.actions,
          sponsorships: data.sponsorships,
          votes: data.votes,
          first_action_date: data.first_action_date,
          latest_action_date: data.latest_action_date,
          latest_action_description: data.latest_action_description,
          latest_passage_date: data.latest_passage_date,
          openstates_url: data.openstates_url,
        };
      }

      case 'openstates.committees': {
        const data = body as OpenStatesCommitteesResponse;
        if (!Array.isArray(data.results)) {
          throw new Error('Missing results array in committees response');
        }
        return {
          results: data.results.map((c) => ({
            id: c.id,
            name: c.name,
            classification: c.classification,
            chamber: c.chamber,
            jurisdiction: c.jurisdiction,
            parent: c.parent,
            created_at: c.created_at,
            updated_at: c.updated_at,
          })),
          pagination: data.pagination,
        };
      }

      default:
        throw new Error(`Unsupported tool: ${req.toolId}`);
    }
  }
}
