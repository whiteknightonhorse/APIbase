import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  EpMepListResponse,
  EpMepDetailResponse,
  EpAdoptedTextsResponse,
  EpProceduresResponse,
} from './types';

/**
 * European Parliament Open Data adapter (UC-588).
 *
 * Supported tools (Phase 1, read-only):
 *   eu_parliament.meps.list          → GET /meps/show-current (active MEPs, filterable)
 *   eu_parliament.meps.details       → GET /meps/{mep-id} (full MEP profile + memberships)
 *   eu_parliament.legislation.adopted_texts → GET /adopted-texts (voted legislative acts)
 *   eu_parliament.legislation.procedures   → GET /procedures (legislative procedures)
 *
 * Auth: none (CC BY 4.0, open access).
 * Rate limit: 500 requests per 5 minutes.
 * Format: application/ld+json
 */
export class EuParliamentAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'eu_parliament',
      baseUrl: 'https://data.europarl.europa.eu/api/v2',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/ld+json',
    };

    switch (req.toolId) {
      case 'eu_parliament.meps.list':
        return this.buildMepsListRequest(params, headers);
      case 'eu_parliament.meps.details':
        return this.buildMepDetailsRequest(params, headers);
      case 'eu_parliament.legislation.adopted_texts':
        return this.buildAdoptedTextsRequest(params, headers);
      case 'eu_parliament.legislation.procedures':
        return this.buildProceduresRequest(params, headers);
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
    const body = raw.body;

    switch (req.toolId) {
      case 'eu_parliament.meps.list': {
        const data = body as EpMepListResponse;
        const items = Array.isArray(data.data) ? data.data : [];
        return {
          meps: items.map((m) => ({
            id: m.identifier ?? m.id,
            name: m.label ?? `${m.givenName ?? ''} ${m.familyName ?? ''}`.trim(),
            family_name: m.familyName,
            given_name: m.givenName,
            country: m['api:country-of-representation'],
            political_group: m['api:political-group'],
          })),
          count: items.length,
        };
      }

      case 'eu_parliament.meps.details': {
        const data = body as EpMepDetailResponse;
        const items = Array.isArray(data.data) ? data.data : [];
        if (!items.length) {
          throw new Error('MEP not found');
        }
        const m = items[0];
        const memberships = Array.isArray(m.hasMembership) ? m.hasMembership : [];
        return {
          id: m.identifier ?? m.id,
          name: m.label ?? `${m.givenName ?? ''} ${m.familyName ?? ''}`.trim(),
          family_name: m.familyName,
          given_name: m.givenName,
          date_of_birth: m.bday,
          memberships: memberships.map((mb) => ({
            organization: mb.organization,
            role: mb.role,
            classification: mb.membershipClassification,
            start_date: mb.memberDuring?.startDate,
            end_date: mb.memberDuring?.endDate,
          })),
        };
      }

      case 'eu_parliament.legislation.adopted_texts': {
        const data = body as EpAdoptedTextsResponse;
        const items = Array.isArray(data.data) ? data.data : [];
        return {
          adopted_texts: items.map((t) => ({
            id: t.id,
            document_date: t.document_date,
            parliamentary_term: t.parliamentary_term,
            adopts: t.adopts ?? [],
            subjects: t.is_about ?? [],
          })),
          count: items.length,
        };
      }

      case 'eu_parliament.legislation.procedures': {
        const data = body as EpProceduresResponse;
        const items = Array.isArray(data.data) ? data.data : [];
        return {
          procedures: items.map((p) => ({
            id: p.id,
            procedure_id: p.process_id,
            type: p.process_type,
            label: p.label,
          })),
          count: items.length,
        };
      }

      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildMepsListRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('format', 'application/ld+json');
    if (params.parliamentary_term) qs.set('parliamentary-term', String(params.parliamentary_term));
    if (params.country) qs.set('country-of-representation', String(params.country));
    if (params.political_group) qs.set('political-group', String(params.political_group));
    if (params.gender) qs.set('gender', String(params.gender));
    const limit = params.limit ? Math.min(Number(params.limit), 100) : 50;
    qs.set('limit', String(limit));
    if (params.offset) qs.set('offset', String(params.offset));

    return {
      url: `${this.baseUrl}/meps/show-current?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildMepDetailsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    if (!params.mep_id) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 400,
        message: 'mep_id is required',
        provider: this.provider,
        toolId: 'eu_parliament.meps.details',
        durationMs: 0,
      };
    }
    const qs = new URLSearchParams();
    qs.set('format', 'application/ld+json');

    return {
      url: `${this.baseUrl}/meps/${encodeURIComponent(String(params.mep_id))}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildAdoptedTextsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('format', 'application/ld+json');
    if (params.parliamentary_term) qs.set('parliamentary-term', String(params.parliamentary_term));
    const limit = params.limit ? Math.min(Number(params.limit), 100) : 20;
    qs.set('limit', String(limit));
    if (params.offset) qs.set('offset', String(params.offset));

    return {
      url: `${this.baseUrl}/adopted-texts?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildProceduresRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('format', 'application/ld+json');
    if (params.parliamentary_term) qs.set('parliamentary-term', String(params.parliamentary_term));
    if (params.procedure_type) qs.set('process-type', String(params.procedure_type));
    const limit = params.limit ? Math.min(Number(params.limit), 100) : 20;
    qs.set('limit', String(limit));
    if (params.offset) qs.set('offset', String(params.offset));

    return {
      url: `${this.baseUrl}/procedures?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
