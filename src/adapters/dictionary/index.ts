import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { DictMeaning, DictDefineOutput, DictWordsOutput } from './types';

/**
 * Dictionary adapter (UC-313 + UC-314).
 *
 * Supported tools:
 *   dictionary.define → Free Dictionary API (dictionaryapi.dev)
 *   dictionary.words  → Datamuse API (datamuse.com)
 *
 * Auth: None. Both APIs free, unlimited, no auth.
 */
export class DictionaryAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'dictionary',
      baseUrl: 'https://api.dictionaryapi.dev/api/v2',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'dictionary.define': {
        const word = encodeURIComponent(String(params.word));
        const lang = String(params.language || 'en');
        return {
          url: `https://api.dictionaryapi.dev/api/v2/entries/${lang}/${word}`,
          method: 'GET',
          headers,
        };
      }

      case 'dictionary.words': {
        const qp = new URLSearchParams();
        if (params.meaning) qp.set('ml', String(params.meaning));
        if (params.sounds_like) qp.set('sl', String(params.sounds_like));
        if (params.rhymes_with) qp.set('rel_rhy', String(params.rhymes_with));
        if (params.starts_with) qp.set('sp', String(params.starts_with) + '*');
        qp.set('max', String(Math.min(Number(params.limit) || 10, 25)));
        qp.set('md', 'dpf'); // include definitions, parts of speech, frequency
        return {
          url: `https://api.datamuse.com/words?${qp.toString()}`,
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
    const body = raw.body as unknown;

    switch (req.toolId) {
      case 'dictionary.define':
        return this.parseDefine(body);
      case 'dictionary.words':
        return this.parseWords(body);
      default:
        return body;
    }
  }

  private parseDefine(body: unknown): DictDefineOutput {
    const entries = Array.isArray(body) ? body : [];
    const entry = (entries[0] ?? {}) as Record<string, unknown>;
    const phonetics = (entry.phonetics ?? []) as { text?: string; audio?: string }[];
    const meanings = (entry.meanings ?? []) as DictMeaning[];

    return {
      word: String(entry.word ?? ''),
      phonetic: String(entry.phonetic ?? phonetics[0]?.text ?? ''),
      audio: phonetics.find((p) => p.audio)?.audio ?? '',
      meanings: meanings.map((m) => ({
        part_of_speech: m.partOfSpeech ?? '',
        definitions: (m.definitions ?? []).slice(0, 5).map((d) => ({
          definition: d.definition ?? '',
          example: d.example ?? '',
        })),
        synonyms: (m.synonyms ?? []).slice(0, 10),
        antonyms: (m.antonyms ?? []).slice(0, 10),
      })),
    };
  }

  private parseWords(body: unknown): DictWordsOutput {
    const words = Array.isArray(body) ? body : [];
    return {
      words: words.map((w: Record<string, unknown>) => ({
        word: String(w.word ?? ''),
        score: Number(w.score ?? 0),
        tags: Array.isArray(w.tags) ? (w.tags as string[]) : [],
      })),
      count: words.length,
    };
  }
}
