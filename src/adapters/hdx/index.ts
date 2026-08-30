import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  HdxActionEnvelope,
  HdxPackageSearchResult,
  HdxPackageShowResult,
  HdxGroupListEntry,
  HdxOrganizationListEntry,
  HdxDatasetSearchOutput,
  HdxDatasetDetailOutput,
  HdxLocationListOutput,
  HdxOrganizationListOutput,
} from './types';

const HDX_ACTION_BASE = 'https://data.humdata.org/api/3/action';
const SEARCH_FIELDS =
  'id,name,title,notes,organization,num_resources,num_tags,dataset_date,last_modified,license_title,tags';
const SLUG_RE = /^[a-z0-9_-]{2,60}$/;

/**
 * Humanitarian Data Exchange (HDX) CKAN Action API adapter (UC-638).
 *
 * Supported tools:
 *   hdx.dataset_search       -> package_search  free-text/country/org dataset discovery (fl-trimmed)
 *   hdx.dataset_detail       -> package_show    full metadata + resource list for one dataset
 *   hdx.location_list        -> group_list      countries/regions with published dataset counts
 *   hdx.organization_list    -> organization_list  humanitarian orgs publishing on HDX
 *
 * Auth: None. Public CKAN Action API operated by UN OCHA (data.humdata.org). Per-dataset resource
 * content carries its own contributor-chosen license (varies, some non-commercial) — these tools
 * only expose HDX's own catalog metadata (titles, descriptions, resource pointers), never resource
 * file content, consistent with the metadata-search pattern used by crossref-datacitations /
 * copernicus-sentinel. `fl=` (Solr field list) on package_search cuts a single search hit from
 * ~100-400KB to a few hundred bytes by dropping the full nested `resources` array — without it, a
 * handful of large datasets (95+ resources) can push one query past several MB.
 */
export class HdxAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'hdx', baseUrl: HDX_ACTION_BASE, maxResponseBytes: 2_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'hdx.dataset_search': {
        const qs = new URLSearchParams();
        const query = params.query ? String(params.query).trim() : '';
        qs.set('q', query || '*:*');
        const country = params.country ? String(params.country).trim().toLowerCase() : '';
        if (country) {
          if (!SLUG_RE.test(country)) {
            throw this.invalidInput(
              req.toolId,
              'country must be an HDX location slug (e.g. "som", "ukr")',
            );
          }
          qs.append('fq', `groups:${country}`);
        }
        const organization = params.organization
          ? String(params.organization).trim().toLowerCase()
          : '';
        if (organization) {
          if (!SLUG_RE.test(organization)) {
            throw this.invalidInput(
              req.toolId,
              'organization must be an HDX organization slug (e.g. "who")',
            );
          }
          qs.append('fq', `organization:${organization}`);
        }
        qs.set('rows', String(this.clamp(params.rows, 10, 1, 20)));
        qs.set('fl', SEARCH_FIELDS);
        return {
          url: `${HDX_ACTION_BASE}/package_search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'hdx.dataset_detail': {
        const id = params.id ? String(params.id).trim() : '';
        if (!id) {
          throw this.invalidInput(
            req.toolId,
            'id is required (HDX dataset id or URL slug, e.g. "hdx-hapi-som")',
          );
        }
        const qs = new URLSearchParams({ id });
        return { url: `${HDX_ACTION_BASE}/package_show?${qs.toString()}`, method: 'GET', headers };
      }

      case 'hdx.location_list': {
        const qs = new URLSearchParams({ all_fields: 'true' });
        return { url: `${HDX_ACTION_BASE}/group_list?${qs.toString()}`, method: 'GET', headers };
      }

      case 'hdx.organization_list': {
        const query = params.query ? String(params.query).trim().toLowerCase() : '';
        const qs = new URLSearchParams({ all_fields: 'true' });
        if (!query) {
          qs.set('limit', String(this.clamp(params.limit, 20, 1, 50)));
        }
        return {
          url: `${HDX_ACTION_BASE}/organization_list?${qs.toString()}`,
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
      case 'hdx.dataset_search': {
        const env = raw.body as HdxActionEnvelope<HdxPackageSearchResult>;
        const output: HdxDatasetSearchOutput = {
          total: env.result.count ?? 0,
          returned: env.result.results.length,
          datasets: env.result.results.map((d) => ({
            id: d.id,
            name: d.name,
            title: d.title,
            notes: d.notes ? d.notes.trim() : null,
            organization:
              typeof d.organization === 'string'
                ? d.organization
                : (d.organization?.title ?? d.organization?.name ?? null),
            num_resources: d.num_resources ?? null,
            dataset_date: d.dataset_date ?? null,
            last_modified: d.last_modified ?? null,
            license_title: d.license_title ?? null,
            tags: (d.tags ?? []).map((t) => (typeof t === 'string' ? t : t.name)),
          })),
        };
        return output;
      }

      case 'hdx.dataset_detail': {
        const env = raw.body as HdxActionEnvelope<HdxPackageShowResult>;
        const p = env.result;
        const output: HdxDatasetDetailOutput = {
          id: p.id,
          name: p.name,
          title: p.title,
          notes: p.notes ? p.notes.trim() : null,
          organization: p.organization?.title ?? p.organization?.name ?? null,
          locations: (p.groups ?? [])
            .map((g) => g.display_name ?? g.title ?? g.name ?? '')
            .filter(Boolean),
          tags: (p.tags ?? []).map((t) => t.name),
          num_resources: p.num_resources ?? (p.resources ?? []).length,
          dataset_date: p.dataset_date ?? null,
          data_update_frequency: p.data_update_frequency ?? null,
          license_title: p.license_title ?? null,
          license_url: p.license_url ?? null,
          dataset_source: p.dataset_source ?? null,
          metadata_modified: p.metadata_modified ?? null,
          resources: (p.resources ?? []).map((r) => ({
            id: r.id,
            name: r.name ?? null,
            description: r.description ? r.description.trim() : null,
            format: r.format ?? null,
            download_url: r.download_url ?? r.url ?? null,
            size_bytes: r.size ?? null,
            last_modified: r.last_modified ?? null,
          })),
        };
        return output;
      }

      case 'hdx.location_list': {
        const env = raw.body as HdxActionEnvelope<HdxGroupListEntry[]>;
        const query = params.query ? String(params.query).trim().toLowerCase() : '';
        const limit = this.clamp(params.limit, 50, 1, 100);
        let all = env.result;
        if (query) {
          all = all.filter((g) =>
            (g.display_name ?? g.title ?? g.name ?? '').toLowerCase().includes(query),
          );
        }
        all = [...all].sort((a, b) => (b.package_count ?? 0) - (a.package_count ?? 0));
        const output: HdxLocationListOutput = {
          total: all.length,
          returned: Math.min(all.length, limit),
          locations: all.slice(0, limit).map((g) => ({
            id: g.name,
            iso3: g.name,
            name: g.display_name ?? g.title,
            dataset_count: g.package_count ?? 0,
          })),
        };
        return output;
      }

      case 'hdx.organization_list': {
        const env = raw.body as HdxActionEnvelope<HdxOrganizationListEntry[]>;
        const query = params.query ? String(params.query).trim().toLowerCase() : '';
        const limit = this.clamp(params.limit, 20, 1, 50);
        let all = env.result;
        if (query) {
          all = all.filter((o) => (o.title ?? o.name ?? '').toLowerCase().includes(query));
          all = [...all].sort((a, b) => (b.package_count ?? 0) - (a.package_count ?? 0));
        }
        const output: HdxOrganizationListOutput = {
          total: all.length,
          returned: Math.min(all.length, limit),
          organizations: all.slice(0, limit).map((o) => ({
            id: o.id,
            slug: o.name,
            title: o.title,
            dataset_count: o.package_count ?? 0,
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
