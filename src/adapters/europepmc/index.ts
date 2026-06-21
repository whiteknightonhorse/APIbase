import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  EuropepmcSearchResponse,
  EuropepmcCitationsResponse,
  EuropepmcReferencesResponse,
  EuropepmcArticle,
  EuropepmcCitation,
  EuropepmcReference,
} from './types';

/**
 * Europe PMC adapter (UC-490).
 *
 * Routes to the EBI Europe PubMed Central REST API:
 *   europepmc.search      -> GET /search?query=... (full-text article search)
 *   europepmc.article     -> GET /search?query=ext_id:{id} AND src:{src} (article details by ID)
 *   europepmc.citations   -> GET /{src}/{id}/citations (citing articles)
 *   europepmc.references  -> GET /{src}/{id}/references (article reference list)
 *
 * No authentication required — open access (CC BY 4.0 data).
 */
export class EuropepmcAdapter extends BaseAdapter {
  private static readonly BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
  private static readonly UA = 'APIbase/1.0 (https://apibase.pro; mailto:contact@apibase.pro)';

  constructor() {
    super({
      provider: 'europepmc',
      baseUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const headers: Record<string, string> = {
      'User-Agent': EuropepmcAdapter.UA,
      Accept: 'application/json',
    };

    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'europepmc.search': {
        const query = encodeURIComponent(String(params['query'] ?? ''));
        const pageSize = Math.min(Number(params['page_size'] ?? 10), 100);
        const page = Number(params['page'] ?? 1);
        const resultType = encodeURIComponent(String(params['result_type'] ?? 'lite'));
        const sort = params['sort'] ? `&sort=${encodeURIComponent(String(params['sort']))}` : '';
        const url =
          `${EuropepmcAdapter.BASE}/search?query=${query}&format=json` +
          `&pageSize=${pageSize}&page=${page}&resultType=${resultType}${sort}`;
        return { url, method: 'GET', headers };
      }

      case 'europepmc.article': {
        const id = encodeURIComponent(String(params['id'] ?? ''));
        const src = encodeURIComponent(String(params['src'] ?? 'MED'));
        const url =
          `${EuropepmcAdapter.BASE}/search?query=ext_id:${id}%20AND%20src:${src}` +
          `&format=json&resultType=core`;
        return { url, method: 'GET', headers };
      }

      case 'europepmc.citations': {
        const id = encodeURIComponent(String(params['id'] ?? ''));
        const src = encodeURIComponent(String(params['src'] ?? 'MED'));
        const pageSize = Math.min(Number(params['page_size'] ?? 10), 1000);
        const page = Number(params['page'] ?? 1);
        const url =
          `${EuropepmcAdapter.BASE}/${src}/${id}/citations` +
          `?format=json&pageSize=${pageSize}&page=${page}`;
        return { url, method: 'GET', headers };
      }

      case 'europepmc.references': {
        const id = encodeURIComponent(String(params['id'] ?? ''));
        const src = encodeURIComponent(String(params['src'] ?? 'MED'));
        const pageSize = Math.min(Number(params['page_size'] ?? 10), 1000);
        const page = Number(params['page'] ?? 1);
        const url =
          `${EuropepmcAdapter.BASE}/${src}/${id}/references` +
          `?format=json&pageSize=${pageSize}&page=${page}`;
        return { url, method: 'GET', headers };
      }

      default:
        throw {
          code: ProviderErrorCode.INPUT_REJECTED,
          message: `Unknown tool: ${req.toolId}`,
          retryable: false,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'europepmc.search': {
        const data = body as unknown as EuropepmcSearchResponse;
        const articles = (data.resultList?.result ?? []).map((a: EuropepmcArticle) =>
          normalizeArticle(a),
        );
        return {
          total: data.hitCount ?? 0,
          page_size: articles.length,
          next_cursor: data.nextCursorMark ?? null,
          articles,
        };
      }

      case 'europepmc.article': {
        const data = body as unknown as EuropepmcSearchResponse;
        const results = data.resultList?.result ?? [];
        if (!results.length) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            message: 'Article not found. Check the id and src parameters.',
            retryable: false,
          };
        }
        return normalizeArticle(results[0]);
      }

      case 'europepmc.citations': {
        const data = body as unknown as EuropepmcCitationsResponse;
        const citations = (data.citationList?.citation ?? []).map((c: EuropepmcCitation) =>
          normalizeCitation(c),
        );
        return {
          total: data.hitCount ?? 0,
          page_size: citations.length,
          citations,
        };
      }

      case 'europepmc.references': {
        const data = body as unknown as EuropepmcReferencesResponse;
        const references = (data.referenceList?.reference ?? []).map((r: EuropepmcReference) =>
          normalizeReference(r),
        );
        return {
          total: data.hitCount ?? 0,
          page_size: references.length,
          references,
        };
      }

      default:
        throw {
          code: ProviderErrorCode.INPUT_REJECTED,
          message: `Unknown tool: ${req.toolId}`,
          retryable: false,
        };
    }
  }
}

function normalizeArticle(a: EuropepmcArticle): Record<string, unknown> {
  const journal = a.journalInfo?.journal;
  return {
    id: a.id,
    source: a.source,
    pmid: a.pmid ?? null,
    pmcid: a.pmcid ?? null,
    doi: a.doi ?? null,
    title: a.title ?? null,
    authors: a.authorString ?? null,
    journal: journal?.title ?? a.journalInfo?.journal?.medlineAbbreviation ?? null,
    pub_year: a.pubYear ?? null,
    abstract: a.abstractText ?? null,
    keywords: a.keywordList?.keyword ?? [],
    mesh_terms: a.meshHeadingList?.meshHeading?.map((m) => m.descriptorName).filter(Boolean) ?? [],
    is_open_access: a.isOpenAccess === 'Y',
    has_full_text_in_pmc: a.inPMC === 'Y',
    cited_by_count: a.citedByCount ?? null,
    has_references: a.hasReferences === 'Y',
    first_publication_date: a.firstPublicationDate ?? null,
    pub_types: a.pubTypeList?.pubType ?? [],
  };
}

function normalizeCitation(c: EuropepmcCitation): Record<string, unknown> {
  return {
    id: c.id ?? null,
    source: c.source ?? null,
    pmid: c.pmid ?? null,
    pmcid: c.pmcid ?? null,
    doi: c.doi ?? null,
    title: c.title ?? null,
    authors: c.authorString ?? null,
    journal: c.journalAbbreviation ?? null,
    pub_year: c.pubYear ?? null,
  };
}

function normalizeReference(r: EuropepmcReference): Record<string, unknown> {
  return {
    id: r.id ?? null,
    source: r.source ?? null,
    pmid: r.pmid ?? null,
    pmcid: r.pmcid ?? null,
    doi: r.doi ?? null,
    title: r.title ?? null,
    authors: r.authorString ?? null,
    journal: r.journalAbbreviation ?? null,
    pub_year: r.pubYear ?? null,
  };
}
