import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Gutendex adapter (UC-400) — JSON wrapper over Project Gutenberg's 78K+ public-domain books.
 * MIT license, no auth, no rate limit.
 * https://gutendex.com
 */
export class GutendexAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'gutendex', baseUrl: 'https://gutendex.com' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'gutendex.search': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('search', String(p.query));
        if (p.language) qs.set('languages', String(p.language));
        if (p.topic) qs.set('topic', String(p.topic));
        if (p.author_year_start !== undefined)
          qs.set('author_year_start', String(p.author_year_start));
        if (p.author_year_end !== undefined) qs.set('author_year_end', String(p.author_year_end));
        return { url: `${this.baseUrl}/books/?${qs.toString()}`, method: 'GET', headers };
      }
      case 'gutendex.book': {
        const id = encodeURIComponent(String(p.book_id));
        return { url: `${this.baseUrl}/books/${id}`, method: 'GET', headers };
      }
      case 'gutendex.by_author': {
        const qs = new URLSearchParams();
        qs.set('search', String(p.author));
        if (p.language) qs.set('languages', String(p.language));
        return { url: `${this.baseUrl}/books/?${qs.toString()}`, method: 'GET', headers };
      }
      case 'gutendex.popular': {
        const qs = new URLSearchParams();
        qs.set('sort', 'popular');
        if (p.language) qs.set('languages', String(p.language));
        if (p.topic) qs.set('topic', String(p.topic));
        return { url: `${this.baseUrl}/books/?${qs.toString()}`, method: 'GET', headers };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const params = req.params as Record<string, unknown>;

    if (req.toolId === 'gutendex.book') {
      return simplifyBook(body);
    }

    const results = (body.results as Array<Record<string, unknown>>) ?? [];
    const limit = Math.max(1, Math.min(50, Number(params.limit ?? 20)));
    return {
      total: body.count,
      returned: Math.min(limit, results.length),
      books: results.slice(0, limit).map(simplifyBook),
    };
  }
}

function simplifyBook(b: Record<string, unknown>): unknown {
  const formats = (b.formats as Record<string, string>) ?? {};
  return {
    id: b.id,
    title: b.title,
    authors: ((b.authors as Array<Record<string, unknown>>) ?? []).map((a) => ({
      name: a.name,
      birth_year: a.birth_year,
      death_year: a.death_year,
    })),
    languages: b.languages,
    subjects: b.subjects,
    bookshelves: b.bookshelves,
    download_count: b.download_count,
    formats: {
      epub: formats['application/epub+zip'],
      txt: formats['text/plain; charset=utf-8'] ?? formats['text/plain'],
      html: formats['text/html'],
      cover: formats['image/jpeg'],
    },
  };
}
