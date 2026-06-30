import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  DoajJournalResult,
  DoajJournalSearchOutput,
  DoajJournalDetailOutput,
  DoajArticleResult,
  DoajArticleSearchOutput,
} from './types';

const DOAJ_BASE = 'https://doaj.org/api';

export class DoajAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'doaj', baseUrl: DOAJ_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (data@apibase.pro)',
    };

    switch (req.toolId) {
      case 'doaj.journal_search': {
        const query = encodeURIComponent(String(params.query ?? '*'));
        const qp = new URLSearchParams();
        qp.set('page', String(Math.max(1, Number(params.page) || 1)));
        qp.set('pageSize', String(Math.min(Number(params.page_size) || 10, 50)));
        if (params.sort) qp.set('sort', String(params.sort));
        return { url: `${DOAJ_BASE}/search/journals/${query}?${qp}`, method: 'GET', headers };
      }

      case 'doaj.journal_detail': {
        const id = encodeURIComponent(String(params.journal_id));
        return { url: `${DOAJ_BASE}/journals/${id}`, method: 'GET', headers };
      }

      case 'doaj.article_search': {
        const query = encodeURIComponent(String(params.query ?? '*'));
        const qp = new URLSearchParams();
        qp.set('page', String(Math.max(1, Number(params.page) || 1)));
        qp.set('pageSize', String(Math.min(Number(params.page_size) || 10, 50)));
        if (params.sort) qp.set('sort', String(params.sort));
        return { url: `${DOAJ_BASE}/search/articles/${query}?${qp}`, method: 'GET', headers };
      }

      case 'doaj.article_detail': {
        const id = encodeURIComponent(String(params.article_id));
        return { url: `${DOAJ_BASE}/articles/${id}`, method: 'GET', headers };
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
      case 'doaj.journal_search':
        return this.parseJournalSearch(body);
      case 'doaj.journal_detail':
        return this.parseJournalDetail(body);
      case 'doaj.article_search':
        return this.parseArticleSearch(body);
      case 'doaj.article_detail':
        return this.parseArticleDetail(body);
      default:
        return body;
    }
  }

  // -----------------------------------------------------------------------
  // Parsers
  // -----------------------------------------------------------------------

  private parseJournalSearch(body: Record<string, unknown>): DoajJournalSearchOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    return {
      total: Number(body.total ?? results.length),
      page: Number(body.page ?? 1),
      pageSize: Number(body.pageSize ?? results.length),
      results: results.map((r) => this.toJournalResult(r)),
    };
  }

  private parseJournalDetail(body: Record<string, unknown>): DoajJournalDetailOutput {
    const base = this.toJournalResult(body);
    const b = (body.bibjson ?? {}) as Record<string, unknown>;
    const ref = (b.ref ?? {}) as Record<string, unknown>;
    const editorial = (b.editorial ?? {}) as Record<string, unknown>;

    return {
      ...base,
      aims_scope_url: String(ref.aims_scope ?? ''),
      author_instructions_url: String(ref.author_instructions ?? ''),
      review_process: this.toStringArray((editorial.review_process ?? []) as unknown[]),
      boai: Boolean(b.boai),
    };
  }

  private parseArticleSearch(body: Record<string, unknown>): DoajArticleSearchOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    return {
      total: Number(body.total ?? results.length),
      page: Number(body.page ?? 1),
      pageSize: Number(body.pageSize ?? results.length),
      results: results.map((r) => this.toArticleResult(r)),
    };
  }

  private parseArticleDetail(body: Record<string, unknown>): DoajArticleResult {
    return this.toArticleResult(body);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private toJournalResult(r: Record<string, unknown>): DoajJournalResult {
    const b = (r.bibjson ?? {}) as Record<string, unknown>;
    const publisher = (b.publisher ?? {}) as Record<string, unknown>;
    const apc = (b.apc ?? {}) as Record<string, unknown>;
    const apcMax = (apc.max ?? []) as Record<string, unknown>[];
    const preservation = (b.preservation ?? {}) as Record<string, unknown>;
    const ref = (b.ref ?? {}) as Record<string, unknown>;

    const apcMaxEur =
      apcMax.filter((x) => x.currency === 'EUR').map((x) => Number(x.price))[0] ?? null;

    return {
      id: String(r.id ?? ''),
      title: String(b.title ?? ''),
      pissn: String(b.pissn ?? ''),
      eissn: String(b.eissn ?? ''),
      publisher: String(publisher.name ?? ''),
      country: String(b.country ?? ''),
      language: this.toStringArray((b.language ?? []) as unknown[]),
      subjects: this.toSubjectTerms((b.subject ?? []) as Record<string, unknown>[]),
      license: this.toLicenseTypes((b.license ?? []) as Record<string, unknown>[]),
      oa_start: b.oa_start != null ? Number(b.oa_start) : null,
      apc: Boolean(apc.has_apc),
      apc_max_eur: apcMaxEur,
      preservation: this.toStringArray((preservation.service ?? []) as unknown[]),
      url: String(ref.journal ?? ''),
      created_date: String(r.created_date ?? ''),
      last_updated: String(r.last_updated ?? ''),
    };
  }

  private toArticleResult(r: Record<string, unknown>): DoajArticleResult {
    const b = (r.bibjson ?? {}) as Record<string, unknown>;
    const journal = (b.journal ?? {}) as Record<string, unknown>;
    const authors = ((b.author ?? []) as Record<string, unknown>[]).map((a) =>
      String(a.name ?? ''),
    );
    const identifiers = (b.identifier ?? []) as Record<string, unknown>[];
    const doi = identifiers.find((x) => x.type === 'doi');
    const links = (b.link ?? []) as Record<string, unknown>[];
    const fulltext = links.find((x) => x.type === 'fulltext') ?? links[0];

    return {
      id: String(r.id ?? ''),
      title: String(b.title ?? ''),
      authors: authors.slice(0, 10),
      journal_title: String(journal.title ?? ''),
      journal_issn: String((journal.issns as string[] | undefined)?.[0] ?? journal.issn ?? ''),
      year: b.year != null ? Number(b.year) : null,
      month: b.month != null ? Number(b.month) : null,
      subjects: this.toSubjectTerms((b.subject ?? []) as Record<string, unknown>[]),
      keywords: this.toStringArray((b.keywords ?? []) as unknown[]),
      abstract: String(b.abstract ?? '').slice(0, 500),
      doi: doi ? String(doi.id ?? '') : '',
      fulltext_url: fulltext ? String(fulltext.url ?? '') : '',
      created_date: String(r.created_date ?? ''),
    };
  }

  private toStringArray(arr: unknown[]): string[] {
    return arr.map((x) => String(x)).filter(Boolean);
  }

  private toSubjectTerms(subjects: Record<string, unknown>[]): string[] {
    return subjects.map((s) => String(s.term ?? '')).filter(Boolean);
  }

  private toLicenseTypes(licenses: Record<string, unknown>[]): string[] {
    return licenses.map((l) => String(l.type ?? '')).filter(Boolean);
  }
}
