import { BaseAdapter } from '../base.adapter';
import { logger } from '../../config/logger';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_TIMEOUT_MS,
  PROVIDER_BACKOFF_BASE_MS,
  PROVIDER_MAX_RESPONSE_BYTES,
} from '../../types/provider';
import type {
  OpenAlexWorksResponse,
  OpenAlexWork,
  ScorecardResponse,
  PubMedSearchResponse,
  PubMedSummaryResponse,
  ArxivResponse,
  ArxivEntry,
  CrossRefWorkResponse,
} from './types';

/**
 * Education / Academic Research adapter (UC-017).
 *
 * Routes to 5 upstream providers based on toolId:
 *   education.paper_search    -> OpenAlex GET /works (academic paper search)
 *   education.paper_details   -> OpenAlex GET /works/{id} (paper details)
 *   education.college_search  -> College Scorecard GET /schools (US college search)
 *   education.college_details -> College Scorecard GET /schools (by ID)
 *   education.pubmed_search   -> PubMed E-utilities esearch+esummary (biomedical search)
 *   education.arxiv_search    -> arXiv GET /query (preprint search, Atom XML)
 *   education.doi_lookup      -> CrossRef GET /works/{doi} (DOI resolution)
 */
export class EducationAdapter extends BaseAdapter {
  private readonly scorecardKey: string;
  private readonly pubmedKey: string;

  private static readonly OPENALEX_BASE = 'https://api.openalex.org';
  private static readonly SCORECARD_BASE =
    'https://api.data.gov/ed/collegescorecard/v1';
  private static readonly PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  private static readonly ARXIV_BASE = 'https://export.arxiv.org/api';
  private static readonly CROSSREF_BASE = 'https://api.crossref.org';
  private static readonly UA = 'APIbase/1.0 (https://apibase.pro; mailto:contact@apibase.pro)';

  constructor(scorecardKey?: string, pubmedKey?: string) {
    super({
      provider: 'education',
      baseUrl: 'https://api.openalex.org',
    });
    this.scorecardKey = scorecardKey ?? 'DEMO_KEY';
    this.pubmedKey = pubmedKey ?? '';
  }

  /**
   * Override call() to handle arXiv XML responses.
   * BaseAdapter.call() assumes JSON; arXiv returns Atom XML.
   * For all other tools, delegate to super.call().
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (req.toolId !== 'education.arxiv_search') {
      return super.call(req);
    }

    // arXiv-specific: handle Atom XML response with retry logic
    const built = this.buildRequest(req);
    let lastError: unknown;

    for (let attempt = 0; attempt <= 2; attempt++) {
      if (attempt > 0) {
        const delayMs = PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
        logger.info(
          { provider: this.provider, tool_id: req.toolId, attempt: attempt + 1, delay_ms: delayMs },
          'Retrying provider call',
        );
      }

      const start = performance.now();
      try {
        const response = await fetch(built.url, {
          method: built.method,
          headers: built.headers,
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });

        const bodyText = await response.text();
        const durationMs = Math.round(performance.now() - start);
        const byteLength = Buffer.byteLength(bodyText, 'utf8');

        if (byteLength > PROVIDER_MAX_RESPONSE_BYTES) {
          throw {
            code: ProviderErrorCode.RESPONSE_TOO_LARGE,
            httpStatus: 502,
            message: `Provider response exceeded ${PROVIDER_MAX_RESPONSE_BYTES} byte limit`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        if (response.status === 429) {
          throw {
            code: ProviderErrorCode.RATE_LIMIT,
            httpStatus: 429,
            message: 'arXiv API rate limit exceeded',
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        if (response.status >= 500) {
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `Provider returned ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        if (response.status >= 400) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: `Provider returned client error ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        // Parse XML to structured data
        const parsed = this.parseArxivXml(bodyText);

        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        return {
          status: response.status,
          headers,
          body: parsed,
          durationMs,
          byteLength,
        };
      } catch (error) {
        lastError = error;
        const providerError = error as { code?: string };
        // Only retry on timeout/unavailable
        if (
          providerError.code !== ProviderErrorCode.TIMEOUT &&
          providerError.code !== ProviderErrorCode.UNAVAILABLE
        ) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'education.paper_search':
        return this.buildPaperSearch(params, headers);
      case 'education.paper_details':
        return this.buildPaperDetails(params, headers);
      case 'education.college_search':
        return this.buildCollegeSearch(params, headers);
      case 'education.college_details':
        return this.buildCollegeDetails(params, headers);
      case 'education.pubmed_search':
        return this.buildPubmedSearch(params, headers);
      case 'education.arxiv_search':
        return this.buildArxivSearch(params, headers);
      case 'education.doi_lookup':
        return this.buildDoiLookup(params, headers);
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
      case 'education.paper_search': {
        const data = body as OpenAlexWorksResponse;
        if (!data.results || !data.meta) {
          throw new Error('Missing results/meta in OpenAlex response');
        }
        return data;
      }
      case 'education.paper_details': {
        const data = body as OpenAlexWork;
        if (!data.id || !data.title) {
          throw new Error('Missing id/title in OpenAlex work response');
        }
        return data;
      }
      case 'education.college_search': {
        const data = body as ScorecardResponse;
        if (!data.results) {
          throw new Error('Missing results in College Scorecard response');
        }
        return data;
      }
      case 'education.college_details': {
        const data = body as ScorecardResponse;
        if (!data.results || data.results.length === 0) {
          throw new Error('School not found in College Scorecard response');
        }
        return data.results[0];
      }
      case 'education.pubmed_search': {
        // Two-step: esearch returns IDs, but we chain to esummary in buildRequest
        // The response is already the summary
        const data = body as PubMedSummaryResponse;
        if (!data.result) {
          // Might be a search-only response
          const searchData = body as PubMedSearchResponse;
          if (!searchData.esearchresult) {
            throw new Error('Missing esearchresult/result in PubMed response');
          }
          return searchData;
        }
        return data;
      }
      case 'education.arxiv_search': {
        // XML parsing handled in call() override; this is a no-op fallback
        const data = body as ArxivResponse;
        if (!data.entries) {
          throw new Error('Missing entries in arXiv response');
        }
        return data;
      }
      case 'education.doi_lookup': {
        const data = body as CrossRefWorkResponse;
        if (!data.message || !data.message.DOI) {
          throw new Error('Missing message/DOI in CrossRef response');
        }
        return data.message;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // OpenAlex — Paper Search
  // ---------------------------------------------------------------------------

  private buildPaperSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('mailto', 'contact@apibase.pro');

    if (params.query) qs.set('search', String(params.query));

    // Build filter string
    const filters: string[] = [];
    if (params.concept) filters.push(`concepts.id:${String(params.concept)}`);
    if (params.author) filters.push(`author.search:${String(params.author)}`);
    if (params.institution) filters.push(`institutions.search:${String(params.institution)}`);
    if (params.year_from) filters.push(`from_publication_date:${String(params.year_from)}-01-01`);
    if (params.year_to) filters.push(`to_publication_date:${String(params.year_to)}-12-31`);
    if (params.open_access_only) filters.push('is_oa:true');
    if (filters.length > 0) qs.set('filter', filters.join(','));

    if (params.sort) {
      const sortMap: Record<string, string> = {
        relevance: 'relevance_score:desc',
        cited_by_count: 'cited_by_count:desc',
        publication_date: 'publication_date:desc',
      };
      qs.set('sort', sortMap[String(params.sort)] || 'relevance_score:desc');
    }

    qs.set('per_page', String(params.limit || 10));

    return {
      url: `${EducationAdapter.OPENALEX_BASE}/works?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // OpenAlex — Paper Details
  // ---------------------------------------------------------------------------

  private buildPaperDetails(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = String(params.id);
    const qs = new URLSearchParams();
    qs.set('mailto', 'contact@apibase.pro');

    // Support both OpenAlex IDs (W2741809807) and DOIs (10.1234/...)
    const path = id.startsWith('10.') ? `doi:${id}` : id;

    return {
      url: `${EducationAdapter.OPENALEX_BASE}/works/${encodeURIComponent(path)}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // College Scorecard — Search
  // ---------------------------------------------------------------------------

  private buildCollegeSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.scorecardKey);

    if (params.name) qs.set('school.name', String(params.name));
    if (params.state) qs.set('school.state', String(params.state).toUpperCase());
    if (params.degree_type) {
      const degreeMap: Record<string, string> = {
        associate: '2',
        bachelor: '3',
        graduate: '4',
      };
      const val = degreeMap[String(params.degree_type)];
      if (val) qs.set('school.degrees_awarded.predominant', val);
    }
    if (params.program) qs.set('latest.programs.cip_4_digit.title', String(params.program));

    qs.set('per_page', String(params.limit || 10));
    qs.set(
      'fields',
      'id,school.name,school.city,school.state,school.zip,school.school_url,' +
        'school.degrees_awarded.predominant,school.ownership,' +
        'latest.admissions.admission_rate.overall,' +
        'latest.cost.tuition.in_state,latest.cost.tuition.out_of_state,' +
        'latest.student.size,latest.earnings.10_yrs_after_entry.median,' +
        'latest.completion.rate_suppressed.overall',
    );

    return {
      url: `${EducationAdapter.SCORECARD_BASE}/schools?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // College Scorecard — Details by ID
  // ---------------------------------------------------------------------------

  private buildCollegeDetails(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const schoolId = String(params.school_id);
    const qs = new URLSearchParams();
    qs.set('api_key', this.scorecardKey);
    qs.set('id', schoolId);
    qs.set(
      'fields',
      'id,school.name,school.city,school.state,school.zip,school.school_url,' +
        'school.degrees_awarded.predominant,school.ownership,' +
        'school.institutional_characteristics.level,' +
        'latest.admissions.admission_rate.overall,' +
        'latest.cost.tuition.in_state,latest.cost.tuition.out_of_state,' +
        'latest.student.size,latest.student.enrollment.undergrad_12_month,' +
        'latest.earnings.10_yrs_after_entry.median,' +
        'latest.completion.rate_suppressed.overall',
    );

    return {
      url: `${EducationAdapter.SCORECARD_BASE}/schools?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // PubMed — E-utilities esearch (returns PMIDs, then fetched via esummary)
  // We use esearch first, then chain to esummary for rich results.
  // Due to AP-7 (1 tool = 1 HTTP call), we do esearch only and return IDs.
  // The agent can call again or we return search results.
  // ---------------------------------------------------------------------------

  private buildPubmedSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('db', 'pubmed');
    qs.set('retmode', 'json');
    qs.set('retmax', String(params.limit || 10));

    // Build search term
    let term = String(params.query);
    if (params.publication_type && params.publication_type !== 'any') {
      const ptMap: Record<string, string> = {
        review: 'Review[pt]',
        'clinical-trial': 'Clinical Trial[pt]',
        'meta-analysis': 'Meta-Analysis[pt]',
      };
      const pt = ptMap[String(params.publication_type)];
      if (pt) term += ` AND ${pt}`;
    }
    if (params.date_from || params.date_to) {
      const from = params.date_from ? String(params.date_from) : '1900/01/01';
      const to = params.date_to ? String(params.date_to) : '3000/12/31';
      qs.set('datetype', 'pdat');
      qs.set('mindate', from);
      qs.set('maxdate', to);
    }
    qs.set('term', term);

    if (this.pubmedKey) qs.set('api_key', this.pubmedKey);

    return {
      url: `${EducationAdapter.PUBMED_BASE}/esearch.fcgi?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // arXiv — Search (Atom XML API)
  // ---------------------------------------------------------------------------

  private buildArxivSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    // arXiv returns Atom XML
    headers['Accept'] = 'application/atom+xml';

    const parts: string[] = [];
    if (params.query) parts.push(`all:${String(params.query)}`);
    if (params.category) parts.push(`cat:${String(params.category)}`);
    if (params.author) parts.push(`au:${String(params.author)}`);

    const searchQuery = parts.join('+AND+');

    const qs = new URLSearchParams();
    qs.set('search_query', searchQuery);
    qs.set('max_results', String(params.limit || 10));

    if (params.sort) {
      const sortMap: Record<string, string> = {
        relevance: 'relevance',
        lastUpdatedDate: 'lastUpdatedDate',
        submittedDate: 'submittedDate',
      };
      qs.set('sortBy', sortMap[String(params.sort)] || 'relevance');
      qs.set('sortOrder', 'descending');
    }

    return {
      url: `${EducationAdapter.ARXIV_BASE}/query?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // CrossRef — DOI Lookup
  // ---------------------------------------------------------------------------

  private buildDoiLookup(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const doi = String(params.doi);
    headers['User-Agent'] = EducationAdapter.UA;

    return {
      url: `${EducationAdapter.CROSSREF_BASE}/works/${encodeURIComponent(doi)}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // arXiv XML parser
  // ---------------------------------------------------------------------------

  private parseArxivXml(xml: string): ArxivResponse {
    // Simple regex-based XML parser for arXiv Atom feed
    const totalMatch = xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/);
    const startMatch = xml.match(/<opensearch:startIndex[^>]*>(\d+)<\/opensearch:startIndex>/);
    const perPageMatch = xml.match(/<opensearch:itemsPerPage[^>]*>(\d+)<\/opensearch:itemsPerPage>/);

    const entries: ArxivEntry[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];

      const getId = (s: string) => {
        const m = s.match(/<id>([\s\S]*?)<\/id>/);
        return m ? m[1].trim() : '';
      };
      const getTag = (s: string, tag: string) => {
        const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return m ? m[1].trim().replace(/\s+/g, ' ') : '';
      };

      // Extract authors
      const authors: string[] = [];
      const authorRegex = /<author>\s*<name>([\s\S]*?)<\/name>/g;
      let authorMatch: RegExpExecArray | null;
      while ((authorMatch = authorRegex.exec(entry)) !== null) {
        authors.push(authorMatch[1].trim());
      }

      // Extract categories
      const categories: string[] = [];
      const catRegex = /<category[^>]*term="([^"]+)"/g;
      let catMatch: RegExpExecArray | null;
      while ((catMatch = catRegex.exec(entry)) !== null) {
        categories.push(catMatch[1]);
      }

      // Extract PDF link
      const pdfMatch = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/);
      const pdfUrl = pdfMatch ? pdfMatch[1] : null;

      // Extract DOI
      const doiMatch = entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/);
      const doi = doiMatch ? doiMatch[1].trim() : null;

      // Extract comment
      const commentMatch = entry.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/);
      const comment = commentMatch ? commentMatch[1].trim() : null;

      // Extract journal_ref
      const jrefMatch = entry.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/);
      const journalRef = jrefMatch ? jrefMatch[1].trim() : null;

      entries.push({
        id: getId(entry),
        title: getTag(entry, 'title'),
        summary: getTag(entry, 'summary'),
        authors,
        published: getTag(entry, 'published'),
        updated: getTag(entry, 'updated'),
        categories,
        doi,
        comment,
        journal_ref: journalRef,
        pdf_url: pdfUrl,
      });
    }

    return {
      totalResults: totalMatch ? parseInt(totalMatch[1], 10) : entries.length,
      startIndex: startMatch ? parseInt(startMatch[1], 10) : 0,
      itemsPerPage: perPageMatch ? parseInt(perPageMatch[1], 10) : entries.length,
      entries,
    };
  }
}
