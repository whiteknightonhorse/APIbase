import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  DataCiteDoiResponse,
  DataCiteSearchResponse,
  DataCiteClientSearchResponse,
  DataCiteWorksStatsResponse,
  DataCiteDoiAttributes,
} from './types';

const API_BASE = 'https://api.datacite.org';
const UA = 'APIbase.pro/1.0 (https://apibase.pro; mailto:contact@apibase.pro)';

/**
 * DataCite REST API adapter (UC-458).
 *
 * Supported tools (read-only, no auth required):
 *   datacite.doi.search      — Search 70M+ DataCite DOIs by keyword, type, year, funder
 *   datacite.doi.lookup      — Get full metadata for a specific DOI
 *   datacite.works.stats     — Aggregated statistics: resource types, providers, funders, years
 *   datacite.client.search   — Search DataCite member repositories (Zenodo, Dryad, Figshare)
 *
 * Auth: None (DataCite is an open non-profit DOI registration agency, CC0 metadata).
 * API: https://api.datacite.org
 */
export class DataCiteAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'datacite', baseUrl: API_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': UA,
    };

    switch (req.toolId) {
      case 'datacite.doi.search': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('query', String(p.query));
        if (p.resource_type) qs.set('resource-type-id', String(p.resource_type));
        if (p.publication_year) qs.set('publication-year', String(p.publication_year));
        if (p.client_id) qs.set('client-id', String(p.client_id));
        if (p.funder_id) qs.set('funder-id', String(p.funder_id));
        const limit = Math.min(Number(p.limit ?? 10), 50);
        qs.set('page[size]', String(limit));
        qs.set('page[number]', String(p.page ?? 1));
        if (p.sort) qs.set('sort', String(p.sort));
        return { url: `${API_BASE}/dois?${qs.toString()}`, method: 'GET', headers };
      }

      case 'datacite.doi.lookup': {
        const doi = encodeURIComponent(String(p.doi));
        return { url: `${API_BASE}/dois/${doi}`, method: 'GET', headers };
      }

      case 'datacite.works.stats': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('query', String(p.query));
        if (p.resource_type) qs.set('resource-type-id', String(p.resource_type));
        if (p.publication_year) qs.set('publication-year', String(p.publication_year));
        qs.set('page[size]', '1');
        return { url: `${API_BASE}/works?${qs.toString()}`, method: 'GET', headers };
      }

      case 'datacite.client.search': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('query', String(p.query));
        const limit = Math.min(Number(p.limit ?? 10), 50);
        qs.set('page[size]', String(limit));
        qs.set('page[number]', String(p.page ?? 1));
        return { url: `${API_BASE}/clients?${qs.toString()}`, method: 'GET', headers };
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
      case 'datacite.doi.search':
        return this.parseSearch(raw.body as DataCiteSearchResponse);
      case 'datacite.doi.lookup':
        return this.parseLookup(raw.body as DataCiteDoiResponse);
      case 'datacite.works.stats':
        return this.parseWorksStats(raw.body as DataCiteWorksStatsResponse);
      case 'datacite.client.search':
        return this.parseClientSearch(raw.body as DataCiteClientSearchResponse);
      default:
        return raw.body;
    }
  }

  private normalizeDoiAttributes(att: DataCiteDoiAttributes) {
    return {
      doi: att.doi,
      url: att.url ?? null,
      title: att.titles?.[0]?.title ?? null,
      creators: (att.creators ?? []).map((c) => ({
        name: c.name,
        affiliation: c.affiliation?.[0]?.name ?? null,
        orcid:
          c.nameIdentifiers?.find((ni) => ni.nameIdentifierScheme === 'ORCID')?.nameIdentifier ??
          null,
      })),
      publisher: att.publisher ?? null,
      publication_year: att.publicationYear ?? null,
      resource_type: att.types?.resourceTypeGeneral ?? null,
      subjects: (att.subjects ?? []).slice(0, 10).map((s) => s.subject),
      abstract:
        att.descriptions?.find((d) => d.descriptionType === 'Abstract')?.description ??
        att.descriptions?.[0]?.description ??
        null,
      license: att.rightsList?.[0]?.rightsUri ?? att.rightsList?.[0]?.rights ?? null,
      funders: (att.fundingReferences ?? []).slice(0, 5).map((f) => ({
        name: f.funderName ?? null,
        award: f.awardNumber ?? null,
      })),
      language: att.language ?? null,
      view_count: att.viewCount ?? 0,
      download_count: att.downloadCount ?? 0,
      citation_count: att.citationCount ?? 0,
      registered: att.registered ?? null,
      updated: att.updated ?? null,
    };
  }

  private parseSearch(body: DataCiteSearchResponse): {
    total: number;
    page: number;
    total_pages: number;
    results: ReturnType<DataCiteAdapter['normalizeDoiAttributes']>[];
    facets: {
      resource_types: Array<{ id: string; label: string; count: number }>;
      providers: Array<{ id: string; label: string; count: number }>;
    };
  } {
    if (!body || !Array.isArray(body.data)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unexpected search response: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }
    const meta = body.meta ?? {};
    return {
      total: meta.total ?? 0,
      page: meta.page ?? 1,
      total_pages: meta.totalPages ?? 1,
      results: body.data.map((item) => this.normalizeDoiAttributes(item.attributes)),
      facets: {
        resource_types: (meta.resourceTypes ?? []).slice(0, 10).map((rt) => ({
          id: rt.id,
          label: rt.title,
          count: rt.count,
        })),
        providers: (meta.providers ?? []).slice(0, 10).map((pr) => ({
          id: pr.id,
          label: pr.title,
          count: pr.count,
        })),
      },
    };
  }

  private parseLookup(body: DataCiteDoiResponse): {
    doi: string;
    metadata: ReturnType<DataCiteAdapter['normalizeDoiAttributes']>;
  } {
    if (!body?.data?.attributes) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unexpected DOI response: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }
    return {
      doi: body.data.id,
      metadata: this.normalizeDoiAttributes(body.data.attributes),
    };
  }

  private parseWorksStats(body: DataCiteWorksStatsResponse): {
    total: number;
    resource_types: Array<{ id: string; label: string; count: number }>;
    years: Array<{ year: string; count: number }>;
    top_providers: Array<{ id: string; label: string; count: number }>;
    top_repositories: Array<{ id: string; label: string; count: number }>;
  } {
    if (!body?.meta) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unexpected works stats response: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }
    const meta = body.meta;
    return {
      total: meta.total ?? 0,
      resource_types: (meta.resourceTypes ?? []).map((rt) => ({
        id: rt.id,
        label: rt.title,
        count: rt.count,
      })),
      years: (meta.registered ?? []).slice(0, 10).map((y) => ({ year: y.id, count: y.count })),
      top_providers: (meta.providers ?? []).slice(0, 10).map((p) => ({
        id: p.id,
        label: p.title,
        count: p.count,
      })),
      top_repositories: ((meta['data-centers'] as typeof meta.providers) ?? [])
        .slice(0, 10)
        .map((c) => ({ id: c.id, label: c.title, count: c.count })),
    };
  }

  private parseClientSearch(body: DataCiteClientSearchResponse): {
    total: number;
    page: number;
    total_pages: number;
    clients: Array<{
      id: string;
      name: string;
      symbol: string;
      description: string | null;
      url: string | null;
      doi_count: number;
    }>;
  } {
    if (!body || !Array.isArray(body.data)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unexpected client search response: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }
    const meta = body.meta ?? {};
    return {
      total: meta.total ?? 0,
      page: meta.page ?? 1,
      total_pages: meta.totalPages ?? 1,
      clients: body.data.map((c) => ({
        id: c.id,
        name: c.attributes.name,
        symbol: c.attributes.symbol,
        description: c.attributes.description ?? null,
        url: c.attributes.url ?? null,
        doi_count: c.attributes.doiCount ?? 0,
      })),
    };
  }
}
