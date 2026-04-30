import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BibleTranslationList,
  BibleBooksList,
  BibleChapter,
  BibleTranslation,
  BibleBook,
} from './types';

/**
 * Free Use Bible API adapter (UC-399).
 * 1,000+ public-domain Bible translations across 429+ languages.
 * MIT license, AWS CloudFront CDN, no auth, no rate limit.
 * https://bible.helloao.org
 */
export class BibleAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'bible', baseUrl: 'https://bible.helloao.org', maxResponseBytes: 2_000_000 });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'bible.translations':
        return { url: `${this.baseUrl}/api/available_translations.json`, method: 'GET', headers };
      case 'bible.books': {
        const tid = encodeURIComponent(String(p.translation));
        return { url: `${this.baseUrl}/api/${tid}/books.json`, method: 'GET', headers };
      }
      case 'bible.passage': {
        const tid = encodeURIComponent(String(p.translation));
        const book = encodeURIComponent(String(p.book));
        const chapter = encodeURIComponent(String(p.chapter));
        return {
          url: `${this.baseUrl}/api/${tid}/${book}/${chapter}.json`,
          method: 'GET',
          headers,
        };
      }
      case 'bible.commentaries':
        return {
          url: `${this.baseUrl}/api/available_commentaries.json`,
          method: 'GET',
          headers,
        };
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
    const params = req.params as Record<string, unknown>;
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'bible.translations': {
        const list = (body as unknown as BibleTranslationList).translations ?? [];
        const langFilter = params.language ? String(params.language).toLowerCase() : null;
        const limit = Math.max(1, Math.min(200, Number(params.limit ?? 50)));
        const filtered = langFilter
          ? list.filter(
              (t: BibleTranslation) =>
                t.language.toLowerCase() === langFilter ||
                t.languageEnglishName.toLowerCase().includes(langFilter),
            )
          : list;
        return {
          total: list.length,
          filtered: filtered.length,
          returned: Math.min(limit, filtered.length),
          translations: filtered.slice(0, limit).map((t) => ({
            id: t.id,
            name: t.englishName,
            short_name: t.shortName,
            language: t.language,
            language_name: t.languageEnglishName,
            text_direction: t.textDirection,
            books: t.numberOfBooks,
            chapters: t.totalNumberOfChapters,
            verses: t.totalNumberOfVerses,
          })),
        };
      }
      case 'bible.books': {
        const list = body as unknown as BibleBooksList;
        return {
          translation: list.translation?.englishName,
          translation_id: list.translation?.id,
          books: (list.books ?? []).map((b: BibleBook) => ({
            id: b.id,
            name: b.commonName,
            chapters: b.numberOfChapters,
          })),
        };
      }
      case 'bible.passage': {
        const ch = body as unknown as BibleChapter;
        const verses: Array<{ number: number; text: string }> = [];
        for (const item of ch.chapter?.content ?? []) {
          if ((item as { type?: string }).type === 'verse') {
            const v = item as {
              number: number;
              content: Array<string | { text?: string }>;
            };
            const text = (v.content ?? [])
              .map((c) => (typeof c === 'string' ? c : (c?.text ?? '')))
              .join(' ')
              .trim();
            verses.push({ number: v.number, text });
          }
        }
        return {
          translation: ch.translation?.englishName,
          book: ch.book?.name,
          chapter: ch.chapter?.number,
          verses,
        };
      }
      case 'bible.commentaries': {
        const list = (body.commentaries as Array<Record<string, unknown>>) ?? [];
        const limit = Math.max(1, Math.min(100, Number(params.limit ?? 50)));
        return {
          total: list.length,
          returned: Math.min(limit, list.length),
          commentaries: list.slice(0, limit).map((c) => ({
            id: c.id,
            name: c.englishName ?? c.name,
            language: c.language,
            description: c.description,
          })),
        };
      }
      default:
        return body;
    }
  }
}
