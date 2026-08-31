import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { SocrataCatalogResponse, SocrataViewMetadata, SocrataDataRow } from './types';

const CATALOG_BASE = 'https://api.us.socrata.com/api/catalog/v1';

// Socrata "4x4" dataset identifier: exactly 4 + 4 lowercase alphanumeric chars, e.g. "erm2-nwe9".
const DATASET_ID_RE = /^[a-z0-9]{4}-[a-z0-9]{4}$/i;

// Hostname format (labels 1-63 chars, at least 2 labels) — SSRF hardening for the `domain`
// param, which is interpolated directly into an outbound request URL in dataset_metadata and
// query_dataset (unlike dataset_search, which only ever calls the fixed api.us.socrata.com host).
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const RESERVED_SUFFIXES = ['.local', '.internal', '.test', '.invalid', '.example', '.arpa'];

/**
 * Socrata Open Data (SODA) adapter (UC-646).
 *
 * Socrata powers thousands of independently-hosted government/civic open-data portals
 * (data.cityofnewyork.us, data.ct.gov, datahub.hhs.gov, data.texas.gov, ...). Two API layers
 * are wrapped:
 *   1. The cross-portal Discovery/Catalog API (api.us.socrata.com/api/catalog/v1) — a single
 *      no-auth endpoint that searches the metadata of EVERY Socrata-powered portal at once.
 *   2. Per-portal endpoints on the caller-supplied `domain` — `/api/views/{id}.json` (dataset
 *      metadata + column schema) and `/resource/{id}.json` (SODA data query, SoQL params).
 *   socrata.dataset_search   -> cross-portal catalog search (q, domains, category, tags)
 *   socrata.dataset_metadata -> per-dataset metadata + column schema on a specific domain
 *   socrata.query_dataset    -> SoQL data query against a specific dataset's actual rows
 *
 * Auth: none. `domain` is validated against a strict hostname regex (rejecting bare IPv4
 * literals, `localhost`, and reserved-use TLD suffixes) before being interpolated into the
 * outbound request URL, since — unlike every other tool here — dataset_metadata/query_dataset
 * let the caller pick which upstream host we call.
 */
export class SocrataAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'socrata', baseUrl: CATALOG_BASE });
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

  private optString(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    const s = String(value).trim();
    return s === '' ? undefined : s;
  }

  private clampLimit(value: unknown, max: number, fallback: number): number {
    const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.min(Math.trunc(n), max);
  }

  private clampOffset(value: unknown): number {
    const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.trunc(n);
  }

  private requireDomain(toolId: string, value: unknown): string {
    const domain = this.optString(value)?.toLowerCase();
    if (!domain || !DOMAIN_RE.test(domain) || IPV4_RE.test(domain) || domain === 'localhost') {
      throw this.invalidInput(
        toolId,
        'domain must be a valid Socrata portal hostname (e.g. "data.cityofnewyork.us"), not an IP address or localhost',
      );
    }
    if (RESERVED_SUFFIXES.some((suffix) => domain.endsWith(suffix))) {
      throw this.invalidInput(toolId, 'domain must be a public Socrata portal hostname');
    }
    return domain;
  }

  private requireDatasetId(toolId: string, value: unknown): string {
    const id = this.optString(value)?.toLowerCase();
    if (!id || !DATASET_ID_RE.test(id)) {
      throw this.invalidInput(
        toolId,
        'dataset_id must be a Socrata 4x4 identifier (e.g. "erm2-nwe9") — see socrata.dataset_search results',
      );
    }
    return id;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'socrata.dataset_search': {
        const qs = new URLSearchParams({
          limit: String(this.clampLimit(params.limit, 50, 10)),
          offset: String(this.clampOffset(params.offset)),
        });
        const q = this.optString(params.query);
        if (q) qs.set('q', q);
        const domains = this.optString(params.domains);
        if (domains) qs.set('domains', domains);
        const category = this.optString(params.category);
        if (category) qs.set('categories', category);
        const tags = this.optString(params.tags);
        if (tags) qs.set('tags', tags);
        const only = this.optString(params.only) ?? 'dataset';
        qs.set('only', only);
        return { url: `${CATALOG_BASE}?${qs.toString()}`, method: 'GET', headers };
      }

      case 'socrata.dataset_metadata': {
        const domain = this.requireDomain(req.toolId, params.domain);
        const id = this.requireDatasetId(req.toolId, params.dataset_id);
        return {
          url: `https://${domain}/api/views/${id}.json`,
          method: 'GET',
          headers,
        };
      }

      case 'socrata.query_dataset': {
        const domain = this.requireDomain(req.toolId, params.domain);
        const id = this.requireDatasetId(req.toolId, params.dataset_id);
        const qs = new URLSearchParams({
          $limit: String(this.clampLimit(params.limit, 1000, 50)),
          $offset: String(this.clampOffset(params.offset)),
        });
        const select = this.optString(params.select);
        if (select) qs.set('$select', select);
        const where = this.optString(params.where);
        if (where) qs.set('$where', where);
        const order = this.optString(params.order);
        if (order) qs.set('$order', order);
        const group = this.optString(params.group);
        if (group) qs.set('$group', group);
        return {
          url: `https://${domain}/resource/${id}.json?${qs.toString()}`,
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
      case 'socrata.dataset_search': {
        const body = raw.body as SocrataCatalogResponse;
        const results = body.results ?? [];
        return {
          returned: results.length,
          total: body.resultSetSize ?? results.length,
          datasets: results.map((r) => ({
            id: r.resource.id,
            name: r.resource.name,
            description: r.resource.description ?? '',
            type: r.resource.type,
            domain: r.metadata.domain,
            category: r.classification?.domain_category ?? '',
            tags: r.classification?.domain_tags ?? [],
            attribution: r.resource.attribution ?? '',
            license: r.metadata.license ?? '',
            updated_at: r.resource.updatedAt ?? '',
            url: r.link ?? r.permalink ?? '',
          })),
        };
      }

      case 'socrata.dataset_metadata': {
        const body = raw.body as SocrataViewMetadata;
        return {
          id: body.id,
          name: body.name,
          description: body.description ?? '',
          category: body.category ?? '',
          attribution: body.attribution ?? '',
          tags: body.tags ?? [],
          view_count: body.viewCount ?? 0,
          download_count: body.downloadCount ?? 0,
          created_at: body.createdAt ? new Date(body.createdAt * 1000).toISOString() : '',
          rows_updated_at: body.rowsUpdatedAt
            ? new Date(body.rowsUpdatedAt * 1000).toISOString()
            : '',
          columns: (body.columns ?? []).map((c) => ({
            name: c.name,
            field_name: c.fieldName,
            data_type: c.dataTypeName,
            description: c.description ?? '',
          })),
        };
      }

      case 'socrata.query_dataset': {
        const rows = raw.body as SocrataDataRow[];
        return { returned: rows.length, records: rows };
      }

      default:
        return raw.body;
    }
  }
}
