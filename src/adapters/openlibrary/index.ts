import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { OlEdition, OlSearchResponse, OlWork, OlAuthor } from './types';

/**
 * Open Library adapter (UC-054).
 *
 * Supported tools (read-only):
 *   books.isbn_lookup  → GET /isbn/{ISBN}.json (302 → /books/{OLID}.json)
 *   books.search       → GET /search.json?q={query}
 *   books.work_details → GET /works/{OLID}.json
 *   books.author       → GET /authors/{OLID}.json
 *
 * Auth: None (CC0 public domain, Internet Archive).
 * Rate: 1-3 req/sec with User-Agent header.
 */
export class OpenLibraryAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'openlibrary',
      baseUrl: 'https://openlibrary.org',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro; hello@apibase.pro)',
    };

    switch (req.toolId) {
      case 'books.isbn_lookup':
        return { url: `${this.baseUrl}/isbn/${params.isbn}.json`, method: 'GET', headers };
      case 'books.search':
        return this.buildSearchRequest(params, headers);
      case 'books.work_details':
        return { url: `${this.baseUrl}/works/${params.olid}.json`, method: 'GET', headers };
      case 'books.author':
        return { url: `${this.baseUrl}/authors/${params.olid}.json`, method: 'GET', headers };
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
      case 'books.isbn_lookup': {
        const d = body as unknown as OlEdition;
        return {
          key: d.key,
          title: d.title,
          publishers: d.publishers ?? [],
          publish_date: d.publish_date,
          pages: d.number_of_pages,
          isbn_10: d.isbn_10?.[0] ?? null,
          isbn_13: d.isbn_13?.[0] ?? null,
          cover: d.covers?.[0] ? `https://covers.openlibrary.org/b/id/${d.covers[0]}-L.jpg` : null,
          work: d.works?.[0]?.key ?? null,
          subjects: (d.subjects ?? []).slice(0, 10),
          description: typeof d.description === 'string'
            ? d.description.slice(0, 500)
            : typeof d.description === 'object' && d.description
              ? (d.description as { value: string }).value?.slice(0, 500)
              : null,
        };
      }
      case 'books.search': {
        const d = body as unknown as OlSearchResponse;
        return {
          total: d.numFound,
          offset: d.start,
          results: (d.docs ?? []).map(doc => ({
            key: doc.key,
            title: doc.title,
            authors: doc.author_name ?? [],
            first_publish_year: doc.first_publish_year,
            isbn: doc.isbn?.[0] ?? null,
            publishers: (doc.publisher ?? []).slice(0, 3),
            edition_count: doc.edition_count,
            pages: doc.number_of_pages_median,
            cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
            rating: doc.ratings_average,
            subjects: (doc.subject ?? []).slice(0, 5),
          })),
        };
      }
      case 'books.work_details': {
        const d = body as unknown as OlWork;
        return {
          key: d.key,
          title: d.title,
          description: typeof d.description === 'string'
            ? d.description.slice(0, 1000)
            : typeof d.description === 'object' && d.description
              ? (d.description as { value: string }).value?.slice(0, 1000)
              : null,
          subjects: (d.subjects ?? []).slice(0, 15),
          subject_places: (d.subject_places ?? []).slice(0, 5),
          subject_times: (d.subject_times ?? []).slice(0, 5),
          authors: (d.authors ?? []).map(a => a.author?.key).filter(Boolean),
          cover: d.covers?.[0] ? `https://covers.openlibrary.org/b/id/${d.covers[0]}-L.jpg` : null,
          first_publish_date: d.first_publish_date,
        };
      }
      case 'books.author': {
        const d = body as unknown as OlAuthor;
        return {
          key: d.key,
          name: d.name,
          personal_name: d.personal_name,
          birth_date: d.birth_date,
          death_date: d.death_date,
          bio: typeof d.bio === 'string'
            ? d.bio.slice(0, 1000)
            : typeof d.bio === 'object' && d.bio
              ? (d.bio as { value: string }).value?.slice(0, 1000)
              : null,
          wikipedia: d.wikipedia,
          photo: d.photos?.[0] ? `https://covers.openlibrary.org/a/id/${d.photos[0]}-L.jpg` : null,
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.query) qs.set('q', String(params.query));
    if (params.title) qs.set('title', String(params.title));
    if (params.author) qs.set('author', String(params.author));
    if (params.subject) qs.set('subject', String(params.subject));
    if (params.isbn) qs.set('isbn', String(params.isbn));
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.page) qs.set('page', String(params.page));
    qs.set('limit', String(params.limit ?? 10));

    return { url: `${this.baseUrl}/search.json?${qs.toString()}`, method: 'GET', headers };
  }
}
