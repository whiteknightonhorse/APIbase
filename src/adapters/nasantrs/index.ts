import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  NtrsCitation,
  NtrsSearchResponse,
  NtrsAggregations,
  NtrsAuthorAffiliation,
  NtrsDownload,
} from './types';

/**
 * NASA Technical Reports Server (NTRS) adapter (UC-474).
 * No auth required — US Government open data (NASA).
 * https://ntrs.nasa.gov/api
 *
 * Supported tools:
 *   nasantrs.search  → GET /api/citations/search (full-text search with filters)
 *   nasantrs.report  → GET /api/citations/{id}   (single citation by numeric ID)
 *   nasantrs.recent  → GET /api/citations/search  (latest publications, sort by date)
 *   nasantrs.stats   → GET /api/citations/search?q=*&limit=0 (corpus statistics)
 */
export class NasaNtrsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'nasantrs',
      baseUrl: 'https://ntrs.nasa.gov',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'nasantrs.search': {
        const qs = new URLSearchParams();
        const q = p.query ? String(p.query) : '*';
        qs.set('q', q);
        const limit = Math.max(1, Math.min(25, Number(p.limit ?? 10)));
        qs.set('limit', String(limit));
        if (p.page) qs.set('page', String(p.page));
        if (p.center) qs.set('center', encodeURIComponent(String(p.center)));
        const sort = p.sort ? String(p.sort) : 'score';
        qs.set('sort', sort);
        if (p.order) qs.set('order', String(p.order));
        return {
          url: `${this.baseUrl}/api/citations/search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'nasantrs.report': {
        const id = encodeURIComponent(String(p.report_id));
        return { url: `${this.baseUrl}/api/citations/${id}`, method: 'GET', headers };
      }

      case 'nasantrs.recent': {
        const qs = new URLSearchParams();
        qs.set('q', '*');
        qs.set('sort', 'releaseDate');
        qs.set('order', 'desc');
        const limit = Math.max(1, Math.min(25, Number(p.limit ?? 10)));
        qs.set('limit', String(limit));
        if (p.center) qs.set('center', encodeURIComponent(String(p.center)));
        if (p.page) qs.set('page', String(p.page));
        return {
          url: `${this.baseUrl}/api/citations/search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'nasantrs.stats': {
        const qs = new URLSearchParams();
        qs.set('q', '*');
        qs.set('limit', '0');
        return {
          url: `${this.baseUrl}/api/citations/search?${qs.toString()}`,
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
    const body = raw.body;

    switch (req.toolId) {
      case 'nasantrs.search': {
        const data = body as NtrsSearchResponse;
        return {
          total: data.stats?.total ?? 0,
          returned: data.results?.length ?? 0,
          results: (data.results ?? []).map(normalizeCitation),
        };
      }

      case 'nasantrs.report': {
        const data = body as NtrsCitation;
        if (!data.id) {
          throw new Error('Missing id in NTRS citation response');
        }
        return normalizeCitation(data);
      }

      case 'nasantrs.recent': {
        const data = body as NtrsSearchResponse;
        return {
          total: data.stats?.total ?? 0,
          returned: data.results?.length ?? 0,
          results: (data.results ?? []).map(normalizeCitation),
        };
      }

      case 'nasantrs.stats': {
        const data = body as NtrsSearchResponse;
        const aggs = (data.aggregations ?? {}) as NtrsAggregations;
        return {
          total_documents: data.stats?.total ?? 0,
          by_type: (aggs.stiType?.buckets ?? []).map((b) => ({
            type: b.key,
            count: b.doc_count,
          })),
          by_subject: (aggs.subjectCategory?.buckets ?? []).map((b) => ({
            subject: b.key,
            count: b.doc_count,
          })),
          by_center: (aggs.center?.buckets ?? []).map((b) => ({
            center: b.key,
            count: b.doc_count,
          })),
          top_keywords: (aggs.keyword?.buckets ?? []).slice(0, 20).map((b) => ({
            keyword: b.key,
            count: b.doc_count,
          })),
        };
      }

      default:
        return body;
    }
  }
}

function normalizeCitation(c: NtrsCitation) {
  const authors = (c.authorAffiliations ?? [])
    .sort((a: NtrsAuthorAffiliation, b: NtrsAuthorAffiliation) => a.sequence - b.sequence)
    .map((a: NtrsAuthorAffiliation) => ({
      name: a.meta?.author?.name ?? '',
      organization: a.meta?.organization?.name ?? null,
    }));

  const downloads = (c.downloads ?? []).map((d: NtrsDownload) => ({
    name: d.name,
    type: d.mimetype,
    pdf_url: d.links?.pdf ? `https://ntrs.nasa.gov${d.links.pdf}` : null,
    fulltext_url: d.links?.fulltext ? `https://ntrs.nasa.gov${d.links.fulltext}` : null,
  }));

  return {
    id: c.id,
    title: c.title,
    abstract: c.abstract ?? null,
    type: c.stiTypeDetails ?? c.stiType ?? null,
    distribution: c.distribution ?? null,
    center: c.center ? { code: c.center.code, name: c.center.name } : null,
    authors,
    keywords: c.keywords ?? [],
    subject_categories: c.subjectCategories ?? [],
    submitted_date: c.submittedDate ?? null,
    distribution_date: c.distributionDate ?? null,
    modified_date: c.modified ?? null,
    report_numbers: c.otherReportNumbers ?? [],
    downloads_available: c.downloadsAvailable ?? false,
    downloads,
    ntrs_url: `https://ntrs.nasa.gov/citations/${c.id}`,
  };
}
