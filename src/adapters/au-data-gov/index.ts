import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  AuDataGovActionEnvelope,
  AuDataGovPackageSearchResult,
  AuDataGovSubjectFacetResult,
  AuDataGovPackageShowResult,
  AuDataGovOrganizationAutocompleteEntry,
  AuDataGovDatasetSearchOutput,
  AuDataGovDatasetDetailOutput,
  AuDataGovSubjectListOutput,
  AuDataGovOrganizationSearchOutput,
} from './types';

const AU_DATA_GOV_ACTION_BASE = 'https://data.gov.au/data/api/3/action';
const SEARCH_FIELDS = 'id,name,title,notes,organization,metadata_modified';
const SLUG_RE = /^[a-z0-9_-]{2,80}$/;

/**
 * Australian Government Open Data CKAN Action API adapter (UC-652).
 *
 * Supported tools:
 *   au-data-gov.dataset_search       -> package_search      free-text/org dataset discovery (fl-trimmed)
 *   au-data-gov.dataset_detail       -> package_show        full metadata + resource list for one dataset
 *   au-data-gov.subject_list         -> package_search facet.field=subject  topic taxonomy with dataset counts
 *   au-data-gov.organization_search  -> organization_autocomplete  publishing agency lookup by name
 *
 * Auth: None. Public CKAN Action API operated by the Australian Government (data.gov.au), catalog
 * content is licensed per-dataset (mostly CC BY 4.0). Unlike open-canada, this portal's `subject`
 * facet (19 AGIFT topic values, matching open-canada's taxonomy shape) is NOT a filterable Solr
 * field on this instance — `fq=subject:<value>` always returns count=0 even for facet values with
 * nonzero counts, so subject_list is browse-only (no corresponding filter param on dataset_search).
 * `organization_list?all_fields=true` silently ignores its `limit` param (always returns exactly 25
 * results per page, respecting only `offset`), so organization lookup instead uses the lightweight
 * `organization_autocomplete` action (q + limit both honored correctly, no title/description bug).
 * `organization_autocomplete` requires a `q` param — omitting it entirely (as opposed to `q=''`)
 * returns an upstream 500, so the adapter always sends `q` (default empty string).
 */
export class AuDataGovAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'au-data-gov',
      baseUrl: AU_DATA_GOV_ACTION_BASE,
      maxResponseBytes: 1_000_000,
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
      case 'au-data-gov.dataset_search': {
        const qs = new URLSearchParams();
        const query = params.query ? String(params.query).trim() : '';
        qs.set('q', query || '*:*');
        const organization = params.organization
          ? String(params.organization).trim().toLowerCase()
          : '';
        if (organization) {
          if (!SLUG_RE.test(organization)) {
            throw this.invalidInput(
              req.toolId,
              'organization must be an agency slug (e.g. "aihw") — see au-data-gov.organization_search',
            );
          }
          qs.append('fq', `organization:${organization}`);
        }
        qs.set('rows', String(this.clamp(params.rows, 10, 1, 20)));
        qs.set('fl', SEARCH_FIELDS);
        return {
          url: `${AU_DATA_GOV_ACTION_BASE}/package_search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'au-data-gov.dataset_detail': {
        const id = params.id ? String(params.id).trim() : '';
        if (!id) {
          throw this.invalidInput(req.toolId, 'id is required (au-data-gov dataset UUID or slug)');
        }
        const qs = new URLSearchParams({ id });
        return {
          url: `${AU_DATA_GOV_ACTION_BASE}/package_show?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'au-data-gov.subject_list': {
        const qs = new URLSearchParams({ rows: '0' });
        qs.append('facet.field', '["subject"]');
        return {
          url: `${AU_DATA_GOV_ACTION_BASE}/package_search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'au-data-gov.organization_search': {
        const query = params.query ? String(params.query).trim() : '';
        const qs = new URLSearchParams({ q: query });
        qs.set('limit', String(this.clamp(params.limit, 20, 1, 50)));
        return {
          url: `${AU_DATA_GOV_ACTION_BASE}/organization_autocomplete?${qs.toString()}`,
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'au-data-gov.dataset_search': {
        const env = raw.body as AuDataGovActionEnvelope<AuDataGovPackageSearchResult>;
        const output: AuDataGovDatasetSearchOutput = {
          total: env.result.count ?? 0,
          returned: env.result.results.length,
          datasets: env.result.results.map((d) => ({
            id: d.id,
            name: d.name,
            title: d.title ?? null,
            notes: d.notes ? d.notes.trim() : null,
            organization: d.organization ?? null,
            metadata_modified: d.metadata_modified ?? null,
          })),
        };
        return output;
      }

      case 'au-data-gov.dataset_detail': {
        const env = raw.body as AuDataGovActionEnvelope<AuDataGovPackageShowResult>;
        const p = env.result;
        const output: AuDataGovDatasetDetailOutput = {
          id: p.id,
          name: p.name,
          title: p.title ?? null,
          notes: p.notes ? p.notes.trim() : null,
          organization: p.organization?.title ?? p.organization?.name ?? null,
          tags: (p.tags ?? []).map((t) => t.display_name ?? t.name),
          num_resources: p.num_resources ?? (p.resources ?? []).length,
          license_title: p.license_title ?? null,
          license_url: p.license_url ?? null,
          metadata_created: p.metadata_created ?? null,
          metadata_modified: p.metadata_modified ?? null,
          resources: (p.resources ?? []).map((r) => ({
            id: r.id,
            name: r.name ?? null,
            description: r.description ? r.description.trim() : null,
            format: r.format ?? null,
            download_url: r.url ?? null,
            size_bytes: r.size ?? null,
            last_modified: r.last_modified ?? null,
          })),
        };
        return output;
      }

      case 'au-data-gov.subject_list': {
        const env = raw.body as AuDataGovActionEnvelope<AuDataGovSubjectFacetResult>;
        const items = env.result.search_facets?.subject?.items ?? [];
        const query = params.query ? String(params.query).trim().toLowerCase() : '';
        let subjects = items.map((i) => ({ subject: i.name, dataset_count: i.count }));
        if (query) {
          subjects = subjects.filter((s) => s.subject.includes(query));
        }
        subjects.sort((a, b) => b.dataset_count - a.dataset_count);
        const output: AuDataGovSubjectListOutput = {
          total: subjects.length,
          subjects,
        };
        return output;
      }

      case 'au-data-gov.organization_search': {
        const env = raw.body as AuDataGovActionEnvelope<AuDataGovOrganizationAutocompleteEntry[]>;
        const output: AuDataGovOrganizationSearchOutput = {
          returned: env.result.length,
          organizations: env.result.map((o) => ({
            id: o.id,
            slug: o.name,
            title: o.title,
          })),
        };
        return output;
      }

      default:
        return raw.body;
    }
  }

  private clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(Math.trunc(n), min), max);
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
