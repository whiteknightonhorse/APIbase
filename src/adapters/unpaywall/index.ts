import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { UnpaywallResponse, UnpaywallOaLookupOutput, UnpaywallOaLocation } from './types';

const UNPAYWALL_BASE = 'https://api.unpaywall.org/v2';
const CONTACT_EMAIL = 'contact@apibase.pro';
const MAX_LOCATIONS = 10;

/**
 * Unpaywall API adapter (UC-598).
 *
 * Supported tools:
 *   unpaywall.oa_lookup -> GET /v2/{doi}?email=...  open-access status + free full-text location for a DOI
 *
 * Auth: None. Public API, but every request MUST include a contact `email` query
 * param per Unpaywall's terms of use (not a credential — a courtesy contact
 * identifier they require to avoid rate-limiting; hardcoded here like the
 * polite-pool User-Agent used by other CC0 scholarly adapters).
 *
 * Note: Unpaywall's /v2/search endpoint has been returning HTTP 500 (broken
 * upstream Elasticsearch index) for all query shapes tested — only the
 * single-DOI lookup endpoint is reliable, so this adapter exposes one tool.
 */
export class UnpaywallAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'unpaywall', baseUrl: UNPAYWALL_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'unpaywall.oa_lookup': {
        const doi = String(params.doi || '').trim();
        if (!doi) {
          throw this.invalidInput(req.toolId, 'doi is required');
        }
        const qs = new URLSearchParams();
        qs.set('email', CONTACT_EMAIL);
        return {
          url: `${UNPAYWALL_BASE}/${encodeURIComponent(doi)}?${qs.toString()}`,
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
    switch (req.toolId) {
      case 'unpaywall.oa_lookup':
        return this.parseOaLookup(raw.body as UnpaywallResponse);
      default:
        return raw.body;
    }
  }

  private parseOaLookup(data: UnpaywallResponse): UnpaywallOaLookupOutput {
    const locations = (data.oa_locations ?? []).slice(0, MAX_LOCATIONS);
    return {
      doi: data.doi,
      doi_url: data.doi_url ?? null,
      title: data.title ?? null,
      genre: data.genre ?? null,
      published_date: data.published_date ?? null,
      year: data.year ?? null,
      publisher: data.publisher ?? null,
      authors: (data.z_authors ?? []).map((a) => [a.given, a.family].filter(Boolean).join(' ')),
      is_oa: data.is_oa ?? false,
      oa_status: data.oa_status ?? null,
      has_repository_copy: data.has_repository_copy ?? false,
      journal: {
        name: data.journal_name ?? null,
        issn_l: data.journal_issn_l ?? null,
        is_oa: data.journal_is_oa ?? false,
        is_in_doaj: data.journal_is_in_doaj ?? false,
      },
      best_oa_location: this.mapLocation(data.best_oa_location),
      oa_locations_count: (data.oa_locations ?? []).length,
      oa_locations: locations.map((loc) => ({
        url: loc.url ?? null,
        url_for_pdf: loc.url_for_pdf ?? null,
        host_type: loc.host_type ?? null,
        license: loc.license ?? null,
        version: loc.version ?? null,
        repository_institution: loc.repository_institution ?? null,
      })),
    };
  }

  private mapLocation(loc?: UnpaywallOaLocation | null) {
    if (!loc) return null;
    return {
      url: loc.url ?? null,
      url_for_pdf: loc.url_for_pdf ?? null,
      host_type: loc.host_type ?? null,
      license: loc.license ?? null,
      version: loc.version ?? null,
    };
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}
