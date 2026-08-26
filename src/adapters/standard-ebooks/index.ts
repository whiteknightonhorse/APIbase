import { BaseAdapter } from '../base.adapter';
import { logger } from '../../config/logger';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
  PROVIDER_TIMEOUT_MS,
  PROVIDER_BACKOFF_BASE_MS,
  PROVIDER_MAX_RESPONSE_BYTES,
} from '../../types/provider';
import type {
  OpdsSearchResponse,
  OpdsPublication,
  SimplifiedBook,
  SimplifiedFormats,
  AtomEntry,
} from './types';

/**
 * Standard Ebooks adapter (UC-600).
 *
 * Routes to 2 upstream endpoints based on toolId:
 *   standard-ebooks.search        -> OPDS 2.0 JSON search feed (free-text query)
 *   standard-ebooks.new_releases  -> Atom XML feed (latest 15 additions, no query support)
 *
 * Both endpoints are unauthenticated. The full-catalog OPDS feed
 * (/feeds/opds/all with no `query` param) and the per-author feed require
 * "Patrons Circle" Basic Auth — only the search-with-query and new-releases
 * feeds are open, and both are explicitly documented as intended for
 * "ereader apps or RSS readers" (i.e. scripted consumption).
 */
export class StandardEbooksAdapter extends BaseAdapter {
  private static readonly BASE = 'https://standardebooks.org';
  private static readonly UA = 'APIbase/1.0 (https://apibase.pro; mailto:contact@apibase.pro)';

  constructor() {
    super({ provider: 'standard-ebooks', baseUrl: 'https://standardebooks.org' });
  }

  /**
   * Override call() for new_releases: the Atom feed returns XML, not JSON.
   * BaseAdapter.call() assumes JSON; search (OPDS+JSON) uses the default path.
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (req.toolId !== 'standard-ebooks.new_releases') {
      return super.call(req);
    }

    const built = this.buildRequest(req);
    let lastError: ProviderError | undefined;

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
            message: 'Standard Ebooks rate limit exceeded',
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
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Provider rejected the request (HTTP ${response.status})`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        const parsed = this.parseNewReleasesXml(bodyText, req);

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
        lastError = error as ProviderError;
        if (
          lastError.code !== ProviderErrorCode.TIMEOUT &&
          lastError.code !== ProviderErrorCode.UNAVAILABLE
        ) {
          throw error;
        }
      }
    }

    throw lastError as ProviderError;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'standard-ebooks.search': {
        const qs = new URLSearchParams();
        qs.set('query', String(p.query));
        const perPage = Math.max(1, Math.min(60, Number(p.per_page ?? 12)));
        qs.set('per-page', String(perPage));
        qs.set('page', String(Math.max(1, Number(p.page ?? 1))));
        const sortMap: Record<string, string> = {
          newest: 'default',
          author: 'author-alpha',
          reading_ease: 'reading-ease',
          length: 'length',
          popularity: 'popularity',
        };
        if (p.sort) qs.set('sort', sortMap[String(p.sort)] || 'default');
        return {
          url: `${StandardEbooksAdapter.BASE}/feeds/opds/all?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/opds+json', 'User-Agent': StandardEbooksAdapter.UA },
        };
      }
      case 'standard-ebooks.new_releases': {
        return {
          url: `${StandardEbooksAdapter.BASE}/feeds/atom/new-releases`,
          method: 'GET',
          headers: { Accept: 'application/atom+xml', 'User-Agent': StandardEbooksAdapter.UA },
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
    if (req.toolId === 'standard-ebooks.search') {
      const data = raw.body as OpdsSearchResponse;
      if (!Array.isArray(data.publications)) {
        throw new Error('Missing publications in Standard Ebooks search response');
      }
      return {
        query_subtitle: data.metadata?.subtitle ?? null,
        returned: data.publications.length,
        books: data.publications.map(simplifyPublication),
      };
    }

    // new_releases: XML already parsed in call() override; this is a no-op fallback
    return raw.body;
  }

  private parseNewReleasesXml(
    xml: string,
    req: ProviderRequest,
  ): { returned: number; books: unknown[] } {
    const params = req.params as Record<string, unknown>;
    const limit = Math.max(1, Math.min(15, Number(params.limit ?? 15)));

    const entries: AtomEntry[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];

      const getTag = (s: string, tag: string) => {
        const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return m ? decodeXmlEntities(m[1].trim()) : '';
      };

      const authorNameMatch = entry.match(/<author>\s*<name>([\s\S]*?)<\/name>/);
      const authorUrlMatch = entry.match(/<author>[\s\S]*?<uri>([\s\S]*?)<\/uri>/);

      const subjects: string[] = [];
      const subjectRegex =
        /<category[^>]*scheme="https:\/\/standardebooks\.org\/vocab\/subjects"[^>]*term="([^"]+)"/g;
      let subjectMatch: RegExpExecArray | null;
      while ((subjectMatch = subjectRegex.exec(entry)) !== null) {
        subjects.push(decodeXmlEntities(subjectMatch[1]));
      }

      const thumbnailMatch = entry.match(/<media:thumbnail url="([^"]+)"/);

      entries.push({
        id: getTag(entry, 'id'),
        title: getTag(entry, 'title'),
        authorName: authorNameMatch ? decodeXmlEntities(authorNameMatch[1].trim()) : '',
        authorUrl: authorUrlMatch ? authorUrlMatch[1].trim() : '',
        published: getTag(entry, 'published'),
        updated: getTag(entry, 'updated'),
        summary: getTag(entry, 'summary'),
        subjects,
        thumbnailUrl: thumbnailMatch ? thumbnailMatch[1] : null,
        formats: extractFormats(entry, getTag(entry, 'id')),
      });
    }

    const sliced = entries.slice(0, limit);
    return {
      returned: sliced.length,
      books: sliced.map((e) => ({
        title: e.title,
        author: e.authorName,
        author_url: e.authorUrl,
        published: e.published || null,
        updated: e.updated || null,
        summary: e.summary,
        subjects: e.subjects,
        cover_url: e.thumbnailUrl,
        formats: e.formats,
      })),
    };
  }
}

function extractFormats(entryXml: string, pageUrl: string): SimplifiedFormats {
  const findLink = (titleMatch: string): string | null => {
    const re = new RegExp(`<link[^>]*href="([^"]+)"[^>]*title="${titleMatch}"`);
    const m = entryXml.match(re);
    if (m) return decodeXmlEntities(m[1]);
    // titles/hrefs can appear in either attribute order
    const re2 = new RegExp(`<link[^>]*title="${titleMatch}"[^>]*href="([^"]+)"`);
    const m2 = entryXml.match(re2);
    return m2 ? decodeXmlEntities(m2[1]) : null;
  };

  return {
    page_url: pageUrl,
    epub_url: findLink('Recommended compatible epub'),
    epub_advanced_url: findLink('Advanced epub'),
    kepub_url: findLink('Kobo Kepub epub'),
    azw3_url: findLink('Amazon Kindle azw3'),
    text_url: findLink('XHTML'),
  };
}

function simplifyPublication(pub: OpdsPublication): SimplifiedBook {
  const meta = pub.metadata;
  const author = meta.author?.[0];
  const subjects = (meta.belongsTo?.subjects ?? [])
    .filter((s) => s.scheme === 'https://standardebooks.org/vocab/subjects')
    .map((s) => s.name);

  const findLink = (title: string): string | null => {
    const link = pub.links.find((l) => l.title === title);
    return link ? link.href : null;
  };

  const hasRel = (rel: string | string[], value: string): boolean =>
    (Array.isArray(rel) ? rel : [rel]).some((r) => r === value);
  const thumbnail = pub.images?.find((i) => hasRel(i.rel, 'http://opds-spec.org/image/thumbnail'));

  return {
    title: meta.title,
    author: author?.name ?? 'Unknown',
    author_url: author?.links?.[0]?.href ?? '',
    language: meta.language ?? null,
    description: meta.description ?? '',
    subjects,
    published: meta.published ?? null,
    modified: meta.modified ?? null,
    cover_url: thumbnail?.href ?? null,
    formats: {
      page_url: meta.identifier,
      epub_url: findLink('Recommended compatible epub'),
      epub_advanced_url: findLink('Advanced epub'),
      kepub_url: findLink('Kobo Kepub epub'),
      azw3_url: findLink('Amazon Kindle azw3'),
      text_url: findLink('XHTML'),
    },
  };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
