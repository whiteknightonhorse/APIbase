import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OpenTdbQuestionsResponse,
  OpenTdbCategoriesResponse,
  OpenTdbCategoryCountResponse,
  OpenTdbGlobalCountResponse,
} from './types';

/**
 * Open Trivia Database adapter (UC-584) — 5000+ user-contributed trivia questions.
 * CC BY-SA 4.0, no auth, free, 24 categories.
 * https://opentdb.com
 */
export class OpenTdbAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'opentdb', baseUrl: 'https://opentdb.com' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'opentdb.questions': {
        const qs = new URLSearchParams();
        qs.set('amount', String(Math.min(50, Math.max(1, Number(p.amount ?? 10)))));
        if (p.category !== undefined) qs.set('category', String(p.category));
        if (p.difficulty) qs.set('difficulty', String(p.difficulty));
        if (p.type) qs.set('type', String(p.type));
        return { url: `${this.baseUrl}/api.php?${qs.toString()}`, method: 'GET', headers };
      }
      case 'opentdb.categories':
        return { url: `${this.baseUrl}/api_category.php`, method: 'GET', headers };
      case 'opentdb.category_count': {
        const catId = encodeURIComponent(String(p.category_id));
        return { url: `${this.baseUrl}/api_count.php?category=${catId}`, method: 'GET', headers };
      }
      case 'opentdb.global_count':
        return { url: `${this.baseUrl}/api_count_global.php`, method: 'GET', headers };
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

    switch (req.toolId) {
      case 'opentdb.questions': {
        const d = body as unknown as OpenTdbQuestionsResponse;
        if (d.response_code === 1) {
          return {
            questions: [],
            count: 0,
            note: 'No results: not enough questions for this query. Try reducing amount or removing difficulty/category filters.',
          };
        }
        if (d.response_code !== 0) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: `Open Trivia DB response_code ${d.response_code}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return {
          count: d.results.length,
          questions: d.results.map((q) => ({
            category: decodeHtml(q.category),
            type: q.type,
            difficulty: q.difficulty,
            question: decodeHtml(q.question),
            correct_answer: decodeHtml(q.correct_answer),
            incorrect_answers: q.incorrect_answers.map(decodeHtml),
            all_answers: shuffle([q.correct_answer, ...q.incorrect_answers]).map(decodeHtml),
          })),
        };
      }
      case 'opentdb.categories': {
        const d = body as unknown as OpenTdbCategoriesResponse;
        return {
          count: d.trivia_categories.length,
          categories: d.trivia_categories.map((c) => ({ id: c.id, name: c.name })),
        };
      }
      case 'opentdb.category_count': {
        const d = body as unknown as OpenTdbCategoryCountResponse;
        const c = d.category_question_count;
        return {
          category_id: d.category_id,
          total: c.total_question_count,
          by_difficulty: {
            easy: c.total_easy_question_count,
            medium: c.total_medium_question_count,
            hard: c.total_hard_question_count,
          },
        };
      }
      case 'opentdb.global_count': {
        const d = body as unknown as OpenTdbGlobalCountResponse;
        return {
          overall: {
            total: d.overall.total_num_of_questions,
            verified: d.overall.total_num_of_verified_questions,
            pending: d.overall.total_num_of_pending_questions,
            rejected: d.overall.total_num_of_rejected_questions,
          },
          categories: Object.entries(d.categories).map(([id, c]) => ({
            id: Number(id),
            total: c.total_num_of_questions,
            verified: c.total_num_of_verified_questions,
            pending: c.total_num_of_pending_questions,
            rejected: c.total_num_of_rejected_questions,
          })),
        };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: raw.durationMs,
        };
    }
  }
}

function decodeHtml(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&deg;/g, '°')
    .replace(/&eacute;/g, 'é')
    .replace(/&agrave;/g, 'à')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uuml;/g, 'ü')
    .replace(/&ouml;/g, 'ö')
    .replace(/&auml;/g, 'ä')
    .replace(/&aring;/g, 'å');
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
