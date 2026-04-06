import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CongressBillsOutput,
  CongressBillDetailOutput,
  CongressMembersOutput,
  BillSummary,
  BillAction,
  MemberSummary,
} from './types';

const CONGRESS_BASE = 'https://api.congress.gov/v3';

/**
 * Congress.gov adapter (UC-336).
 *
 * US federal legislation, members, committees since 1973.
 * Library of Congress open data. API key (query param), 5K/hr.
 */
export class CongressAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'congress', baseUrl: CONGRESS_BASE });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const qp = new URLSearchParams();
    qp.set('api_key', this.apiKey);
    qp.set('format', 'json');
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'congress.bills': {
        if (params.congress) qp.set('congress', String(params.congress));
        if (params.type) qp.set('type', String(params.type));
        qp.set('limit', String(Math.min(Number(params.limit) || 10, 25)));
        qp.set('sort', 'updateDate+desc');
        return {
          url: `${CONGRESS_BASE}/bill?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'congress.bill_details': {
        const congress = Number(params.congress);
        const type = encodeURIComponent(String(params.type));
        const number = Number(params.number);
        return {
          url: `${CONGRESS_BASE}/bill/${congress}/${type}/${number}?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'congress.members': {
        if (params.state) qp.set('fromState', String(params.state).toUpperCase());
        if (params.chamber) qp.set('currentMember', 'true');
        if (params.congress) qp.set('congress', String(params.congress));
        qp.set('limit', String(Math.min(Number(params.limit) || 10, 25)));
        return {
          url: `${CONGRESS_BASE}/member?${qp.toString()}`,
          method: 'GET',
          headers,
        };
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
      case 'congress.bills':
        return this.parseBills(body);
      case 'congress.bill_details':
        return this.parseBillDetail(body);
      case 'congress.members':
        return this.parseMembers(body);
      default:
        return body;
    }
  }

  private parseBills(body: Record<string, unknown>): CongressBillsOutput {
    const bills = (body.bills ?? []) as Record<string, unknown>[];
    const pagination = (body.pagination ?? {}) as Record<string, unknown>;

    return {
      total: Number(pagination.count ?? bills.length),
      results: bills.map(
        (b): BillSummary => ({
          congress: Number(b.congress ?? 0),
          type: String(b.type ?? ''),
          number: Number(b.number ?? 0),
          title: String(b.title ?? '').slice(0, 300),
          sponsor: this.extractSponsor(b),
          party: this.extractParty(b),
          introduced_date: String(b.introducedDate ?? ''),
          latest_action: String((b.latestAction as Record<string, unknown>)?.text ?? '').slice(
            0,
            200,
          ),
          latest_action_date: String((b.latestAction as Record<string, unknown>)?.actionDate ?? ''),
          policy_area: String((b.policyArea as Record<string, unknown>)?.name ?? ''),
          url: String(b.url ?? ''),
        }),
      ),
    };
  }

  private parseBillDetail(body: Record<string, unknown>): CongressBillDetailOutput {
    const bill = (body.bill ?? body) as Record<string, unknown>;
    const sponsors = (bill.sponsors ?? []) as Record<string, unknown>[];
    const actions = (bill.actions ?? []) as Record<string, unknown>[];
    const subjects = (bill.subjects ?? {}) as Record<string, unknown>;
    const committees = (bill.committees ?? {}) as Record<string, unknown>;
    const sponsor = sponsors[0] ?? {};

    return {
      congress: Number(bill.congress ?? 0),
      type: String(bill.type ?? ''),
      number: Number(bill.number ?? 0),
      title: String(bill.title ?? '').slice(0, 500),
      introduced_date: String(bill.introducedDate ?? ''),
      sponsor: String(sponsor.fullName ?? sponsor.firstName ?? ''),
      sponsor_party: String(sponsor.party ?? ''),
      sponsor_state: String(sponsor.state ?? ''),
      cosponsors_count: Number((bill.cosponsors as Record<string, unknown>)?.count ?? 0),
      latest_action: String((bill.latestAction as Record<string, unknown>)?.text ?? '').slice(
        0,
        300,
      ),
      latest_action_date: String((bill.latestAction as Record<string, unknown>)?.actionDate ?? ''),
      policy_area: String((bill.policyArea as Record<string, unknown>)?.name ?? ''),
      subjects: ((subjects.legislativeSubjects as Record<string, unknown>[]) ?? [])
        .slice(0, 10)
        .map((s) => String(s.name ?? '')),
      actions: (Array.isArray(actions) ? actions : []).slice(0, 10).map(
        (a): BillAction => ({
          date: String(a.actionDate ?? ''),
          text: String(a.text ?? '').slice(0, 200),
          type: String(a.type ?? ''),
        }),
      ),
      committees: ((committees.billCommittees as Record<string, unknown>[]) ?? [])
        .slice(0, 5)
        .map((c) => String(c.name ?? '')),
      url: String(bill.url ?? ''),
    };
  }

  private parseMembers(body: Record<string, unknown>): CongressMembersOutput {
    const members = (body.members ?? []) as Record<string, unknown>[];
    const pagination = (body.pagination ?? {}) as Record<string, unknown>;

    return {
      total: Number(pagination.count ?? members.length),
      results: members.map(
        (m): MemberSummary => ({
          bioguide_id: String(m.bioguideId ?? ''),
          name: String(m.name ?? ''),
          party: String(m.partyName ?? ''),
          state: String(m.state ?? ''),
          district: m.district ? String(m.district) : null,
          chamber: String(
            ((m.terms as Record<string, unknown>)?.item as Record<string, unknown>[])?.[0]
              ?.chamber ?? '',
          ),
          served: `${m.depiction ? 'Current' : 'Former'}`,
          url: String(m.url ?? ''),
        }),
      ),
    };
  }

  private extractSponsor(b: Record<string, unknown>): string {
    const sponsors = b.sponsors as Record<string, unknown>[] | undefined;
    if (!sponsors?.length) return '';
    return String(sponsors[0].fullName ?? sponsors[0].firstName ?? '');
  }

  private extractParty(b: Record<string, unknown>): string {
    const sponsors = b.sponsors as Record<string, unknown>[] | undefined;
    if (!sponsors?.length) return '';
    return String(sponsors[0].party ?? '');
  }
}
