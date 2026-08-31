import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OpenCanadaActionEnvelope,
  OpenCanadaPackageSearchResult,
  OpenCanadaPackageShowResult,
  OpenCanadaOrganizationListEntry,
  OpenCanadaDatasetSearchOutput,
  OpenCanadaDatasetDetailOutput,
  OpenCanadaSubjectListOutput,
  OpenCanadaOrganizationListOutput,
} from './types';

const OPEN_CANADA_ACTION_BASE = 'https://open.canada.ca/data/api/3/action';
const SEARCH_FIELDS =
  'id,name,title,notes,organization,subject,portal_release_date,metadata_modified';
const SLUG_RE = /^[a-z0-9_-]{2,60}$/;

/**
 * Open Government Canada CKAN Action API adapter (UC-641).
 *
 * Supported tools:
 *   open-canada.dataset_search       -> package_search  free-text/subject/org dataset discovery (fl-trimmed)
 *   open-canada.dataset_detail       -> package_show    full metadata + resource list for one dataset
 *   open-canada.subject_list         -> package_search facet.field=subject  topic taxonomy with dataset counts
 *   open-canada.organization_list    -> organization_list  federal departments/agencies publishing datasets
 *
 * Auth: None. Public CKAN Action API operated by the Government of Canada (open.canada.ca), all
 * catalog content licensed under the Open Government Licence - Canada (commercial reuse permitted).
 * Unlike HDX, this portal does not use CKAN "groups" for topics — group_list returns an empty list —
 * so subject/topic browsing instead uses the `subject` Solr facet (19 fixed values, e.g.
 * "nature_and_environment", "health_and_safety"). `fl=` (Solr field list) on package_search only
 * accepts real stored Solr fields — `title`/`notes` (the English-default flattened strings) work,
 * but `num_resources`/`license_title`/`title_translated`/`notes_translated` are computed at
 * read-time and are silently dropped by `fl=`, so dataset_search intentionally omits them (available
 * via dataset_detail instead).
 */
export class OpenCanadaAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'open-canada',
      baseUrl: OPEN_CANADA_ACTION_BASE,
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
      case 'open-canada.dataset_search': {
        const qs = new URLSearchParams();
        const query = params.query ? String(params.query).trim() : '';
        qs.set('q', query || '*:*');
        const subject = params.subject ? String(params.subject).trim().toLowerCase() : '';
        if (subject) {
          if (!SLUG_RE.test(subject)) {
            throw this.invalidInput(
              req.toolId,
              'subject must be a topic slug (e.g. "health_and_safety") — see open-canada.subject_list',
            );
          }
          qs.append('fq', `subject:${subject}`);
        }
        const organization = params.organization
          ? String(params.organization).trim().toLowerCase()
          : '';
        if (organization) {
          if (!SLUG_RE.test(organization)) {
            throw this.invalidInput(
              req.toolId,
              'organization must be an Open Canada org slug (e.g. "nrcan-rncan") — see open-canada.organization_list',
            );
          }
          qs.append('fq', `organization:${organization}`);
        }
        qs.set('rows', String(this.clamp(params.rows, 10, 1, 20)));
        qs.set('fl', SEARCH_FIELDS);
        return {
          url: `${OPEN_CANADA_ACTION_BASE}/package_search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'open-canada.dataset_detail': {
        const id = params.id ? String(params.id).trim() : '';
        if (!id) {
          throw this.invalidInput(req.toolId, 'id is required (Open Canada dataset UUID or slug)');
        }
        const qs = new URLSearchParams({ id });
        return {
          url: `${OPEN_CANADA_ACTION_BASE}/package_show?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'open-canada.subject_list': {
        const qs = new URLSearchParams({ rows: '0' });
        qs.append('facet.field', '["subject"]');
        return {
          url: `${OPEN_CANADA_ACTION_BASE}/package_search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'open-canada.organization_list': {
        const query = params.query ? String(params.query).trim().toLowerCase() : '';
        const qs = new URLSearchParams({ all_fields: 'true' });
        if (!query) {
          qs.set('limit', String(this.clamp(params.limit, 20, 1, 50)));
        }
        return {
          url: `${OPEN_CANADA_ACTION_BASE}/organization_list?${qs.toString()}`,
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
      case 'open-canada.dataset_search': {
        const env = raw.body as OpenCanadaActionEnvelope<OpenCanadaPackageSearchResult>;
        const output: OpenCanadaDatasetSearchOutput = {
          total: env.result.count ?? 0,
          returned: env.result.results.length,
          datasets: env.result.results.map((d) => ({
            id: d.id,
            name: d.name,
            title: d.title ?? null,
            notes: d.notes ? d.notes.trim() : null,
            organization: d.organization ?? null,
            subjects: d.subject ?? [],
            portal_release_date: d.portal_release_date ?? null,
            metadata_modified: d.metadata_modified ?? null,
          })),
        };
        return output;
      }

      case 'open-canada.dataset_detail': {
        const env = raw.body as OpenCanadaActionEnvelope<OpenCanadaPackageShowResult>;
        const p = env.result;
        const title = p.title_translated?.en ?? p.title ?? null;
        const notes = p.notes_translated?.en ?? p.notes ?? null;
        const output: OpenCanadaDatasetDetailOutput = {
          id: p.id,
          name: p.name,
          title,
          notes: notes ? notes.trim() : null,
          organization: p.organization?.title ?? p.organization?.name ?? null,
          subjects: p.subject ?? [],
          keywords: p.keywords?.en ?? [],
          num_resources: p.num_resources ?? (p.resources ?? []).length,
          portal_release_date: p.portal_release_date ?? null,
          frequency: p.frequency ?? null,
          license_title: p.license_title ?? null,
          license_url: p.license_url ?? null,
          jurisdiction: p.jurisdiction ?? null,
          metadata_modified: p.metadata_modified ?? null,
          resources: (p.resources ?? []).map((r) => ({
            id: r.id,
            name: r.name_translated?.en ?? r.name ?? null,
            description: r.description ? r.description.trim() : null,
            format: r.format ?? null,
            download_url: r.url ?? null,
            size_bytes: r.size ?? null,
            last_modified: r.last_modified ?? null,
          })),
        };
        return output;
      }

      case 'open-canada.subject_list': {
        const env = raw.body as OpenCanadaActionEnvelope<OpenCanadaPackageSearchResult>;
        const facet = env.result.facets?.subject ?? {};
        const query = params.query ? String(params.query).trim().toLowerCase() : '';
        let subjects = Object.entries(facet).map(([subject, dataset_count]) => ({
          subject,
          dataset_count,
        }));
        if (query) {
          subjects = subjects.filter((s) => s.subject.includes(query));
        }
        subjects.sort((a, b) => b.dataset_count - a.dataset_count);
        const output: OpenCanadaSubjectListOutput = {
          total: subjects.length,
          subjects,
        };
        return output;
      }

      case 'open-canada.organization_list': {
        const env = raw.body as OpenCanadaActionEnvelope<OpenCanadaOrganizationListEntry[]>;
        const query = params.query ? String(params.query).trim().toLowerCase() : '';
        const limit = this.clamp(params.limit, 20, 1, 50);
        let all = env.result;
        if (query) {
          all = all.filter((o) => (o.title ?? o.name ?? '').toLowerCase().includes(query));
          all = [...all].sort((a, b) => (b.package_count ?? 0) - (a.package_count ?? 0));
        }
        const output: OpenCanadaOrganizationListOutput = {
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
