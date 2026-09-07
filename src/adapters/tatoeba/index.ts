import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Tatoeba adapter (UC-402) — 13M parallel sentences, 1M+ audio recordings, 429 languages.
 * CC-BY 2.0 FR. Unstable v0 API (https://api.tatoeba.org/openapi.json).
 * Fixed 2026-09-07: replaced tatoeba.languages (endpoint removed by provider) with tatoeba.audio.
 */
export class TatoebaAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'tatoeba', baseUrl: 'https://api.tatoeba.org' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'tatoeba.search': {
        const qs = new URLSearchParams();
        qs.set('lang', String(p.language ?? 'eng'));
        qs.set('sort', String(p.sort ?? 'relevance'));
        qs.set('limit', String(Math.max(1, Math.min(50, Number(p.limit ?? 10)))));
        if (p.query) qs.set('q', String(p.query));
        if (p.translation_lang) qs.set('trans_lang', String(p.translation_lang));
        if (p.has_audio) qs.set('has_audio', 'yes');
        return {
          url: `${this.baseUrl}/unstable/sentences?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'tatoeba.sentence': {
        const id = encodeURIComponent(String(p.sentence_id));
        return { url: `${this.baseUrl}/unstable/sentences/${id}`, method: 'GET', headers };
      }
      case 'tatoeba.audio': {
        const qs = new URLSearchParams();
        qs.set('limit', String(Math.max(1, Math.min(50, Number(p.limit ?? 10)))));
        if (p.language) qs.set('lang', String(p.language));
        if (p.author) qs.set('author', String(p.author));
        return {
          url: `${this.baseUrl}/unstable/audios?${qs.toString()}`,
          method: 'GET',
          headers,
        };
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

    switch (req.toolId) {
      case 'tatoeba.search': {
        const data = (body.data as Array<Record<string, unknown>>) ?? [];
        const paging = (body.paging as Record<string, unknown>) ?? {};
        return {
          total: paging.total ?? data.length,
          has_next: paging.has_next ?? false,
          sentences: data.map((s) => ({
            id: s.id,
            text: s.text,
            language: s.lang,
            license: s.license,
            owner: s.owner,
          })),
        };
      }
      case 'tatoeba.sentence': {
        const data = (body.data as Record<string, unknown>) ?? body;
        return {
          id: data.id,
          text: data.text,
          language: data.lang,
          license: data.license,
          owner: data.owner,
          translations: data.translations ?? [],
          audios: data.audios ?? [],
        };
      }
      case 'tatoeba.audio': {
        const data = (body.data as Array<Record<string, unknown>>) ?? [];
        const paging = (body.paging as Record<string, unknown>) ?? {};
        return {
          total: paging.total ?? data.length,
          has_next: paging.has_next ?? false,
          audios: data.map((a) => ({
            id: a.id,
            sentence_id: a.sentence_id,
            author: a.author,
            uploader: a.uploader,
            language: a.lang,
            duration: a.duration,
          })),
        };
      }
      default:
        return body;
    }
  }
}
