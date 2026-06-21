import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  RorOrganization,
  RorSearchResponse,
  RorAffiliationResponse,
  RorOrgSummary,
  RorSearchOutput,
  RorGetOutput,
  RorFilterOutput,
  RorAffiliationOutput,
  RorLocation,
} from './types';

const ROR_BASE = 'https://api.ror.org';

/**
 * ROR (Research Organization Registry) adapter (UC-491).
 *
 * Open registry of 110K+ global research organizations.
 * No auth, CC0 public domain. Maintained by DataCite/CrossRef/CDL.
 */
export class RorAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ror', baseUrl: ROR_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'ror.search': {
        const qp = new URLSearchParams();
        qp.set('query', String(params.query));
        qp.set('page', String(Math.max(1, Number(params.page) || 1)));
        if (params.all_status) qp.set('all_status', 'true');
        return { url: `${ROR_BASE}/organizations?${qp.toString()}`, method: 'GET', headers };
      }

      case 'ror.get': {
        const rawId = String(params.ror_id);
        // Accept full URL (https://ror.org/xxx) or short ID (xxx)
        const shortId = rawId.startsWith('https://ror.org/')
          ? rawId.slice('https://ror.org/'.length)
          : rawId;
        return {
          url: `${ROR_BASE}/organizations/${encodeURIComponent(shortId)}`,
          method: 'GET',
          headers,
        };
      }

      case 'ror.filter': {
        const qp = new URLSearchParams();
        const parts: string[] = [];
        if (params.types) parts.push(`types:${encodeURIComponent(String(params.types))}`);
        if (params.country_code)
          parts.push(
            `country.country_code:${encodeURIComponent(String(params.country_code).toUpperCase())}`,
          );
        if (params.status) parts.push(`status:${encodeURIComponent(String(params.status))}`);
        if (parts.length > 0) qp.set('filter', parts.join(','));
        if (params.query) qp.set('query', String(params.query));
        qp.set('page', String(Math.max(1, Number(params.page) || 1)));
        return { url: `${ROR_BASE}/organizations?${qp.toString()}`, method: 'GET', headers };
      }

      case 'ror.affiliation': {
        const qp = new URLSearchParams();
        qp.set('affiliation', String(params.affiliation));
        return { url: `${ROR_BASE}/organizations?${qp.toString()}`, method: 'GET', headers };
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
      case 'ror.search':
        return this.parseSearch(body as unknown as RorSearchResponse);

      case 'ror.get':
        return this.parseGet(body as unknown as RorOrganization);

      case 'ror.filter':
        return this.parseFilter(body as unknown as RorSearchResponse);

      case 'ror.affiliation':
        return this.parseAffiliation(body as unknown as RorAffiliationResponse);

      default:
        return body;
    }
  }

  private parseSearch(body: RorSearchResponse): RorSearchOutput {
    return {
      total: Number(body.number_of_results ?? 0),
      results: (body.items ?? []).map((org) => this.toSummary(org)),
    };
  }

  private parseGet(body: RorOrganization): RorGetOutput {
    const summary = this.toSummary(body);
    const extIds: Record<string, string | null> = {};
    for (const e of body.external_ids ?? []) {
      extIds[e.type] = e.preferred ?? e.all?.[0] ?? null;
    }
    return {
      ...summary,
      external_ids: extIds,
      relationships: (body.relationships ?? []).map((r) => ({
        type: r.type,
        id: r.id,
        label: r.label,
      })),
      domains: body.domains ?? [],
      locations: (body.locations ?? []).map((loc: RorLocation) => ({
        city: loc.geonames_details?.name ?? '',
        country: loc.geonames_details?.country_name ?? '',
        country_code: loc.geonames_details?.country_code ?? '',
        lat: loc.geonames_details?.lat ?? null,
        lng: loc.geonames_details?.lng ?? null,
      })),
    };
  }

  private parseFilter(body: RorSearchResponse): RorFilterOutput {
    return {
      total: Number(body.number_of_results ?? 0),
      results: (body.items ?? []).map((org) => this.toSummary(org)),
    };
  }

  private parseAffiliation(body: RorAffiliationResponse): RorAffiliationOutput {
    return {
      total: Number(body.number_of_results ?? 0),
      results: (body.items ?? []).map((item) => {
        const org = item.organization;
        const primaryName =
          org.names?.find((n) => n.types.includes('ror_display'))?.value ??
          org.names?.[0]?.value ??
          '';
        const acronymEntry = org.names?.find((n) => n.types.includes('acronym'));
        const loc = org.locations?.[0];
        const website = org.links?.find((l) => l.type === 'website')?.value ?? null;
        return {
          id: org.id,
          name: primaryName,
          acronym: acronymEntry?.value ?? null,
          score: Number(item.score ?? 0),
          chosen: Boolean(item.chosen),
          matching_type: String(item.matching_type ?? ''),
          types: org.types ?? [],
          status: String(org.status ?? ''),
          country: loc?.geonames_details?.country_name ?? null,
          country_code: loc?.geonames_details?.country_code ?? null,
          website,
        };
      }),
    };
  }

  private toSummary(org: RorOrganization): RorOrgSummary {
    const primaryName =
      org.names?.find((n) => n.types.includes('ror_display'))?.value ?? org.names?.[0]?.value ?? '';
    const acronymEntry = org.names?.find((n) => n.types.includes('acronym'));
    const loc = org.locations?.[0];
    const website = org.links?.find((l) => l.type === 'website')?.value ?? null;
    const wikipedia = org.links?.find((l) => l.type === 'wikipedia')?.value ?? null;
    return {
      id: org.id,
      name: primaryName,
      acronym: acronymEntry?.value ?? null,
      types: org.types ?? [],
      status: String(org.status ?? ''),
      established: org.established != null ? Number(org.established) : null,
      country: loc?.geonames_details?.country_name ?? null,
      country_code: loc?.geonames_details?.country_code ?? null,
      city: loc?.geonames_details?.name ?? null,
      website,
      wikipedia,
    };
  }
}
