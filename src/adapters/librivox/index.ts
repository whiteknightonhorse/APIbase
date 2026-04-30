import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * LibriVox adapter (UC-401) — 20K+ public-domain audiobooks.
 * Audio donated to public domain. JSON via ?format=json.
 * Adapter must include a User-Agent header to bypass CloudFlare bot challenge.
 * https://librivox.org/api/info
 */
export class LibriVoxAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'librivox', baseUrl: 'https://librivox.org' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'librivox.search': {
        const qs = new URLSearchParams();
        qs.set('format', 'json');
        if (p.title) qs.set('title', String(p.title));
        if (p.author) qs.set('author', String(p.author));
        if (p.genre) qs.set('genre', String(p.genre));
        qs.set('limit', String(Math.max(1, Math.min(100, Number(p.limit ?? 25)))));
        if (p.offset !== undefined) qs.set('offset', String(p.offset));
        return {
          url: `${this.baseUrl}/api/feed/audiobooks/?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'librivox.book': {
        const qs = new URLSearchParams();
        qs.set('format', 'json');
        qs.set('id', String(p.book_id));
        qs.set('extended', '1');
        return {
          url: `${this.baseUrl}/api/feed/audiobooks/?${qs.toString()}`,
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
    const list = (body.books as Array<Record<string, unknown>>) ?? [];

    if (req.toolId === 'librivox.book') {
      const b = list[0];
      if (!b) return { error: 'book not found' };
      const sections = (b.sections as Array<Record<string, unknown>>) ?? [];
      return {
        id: b.id,
        title: b.title,
        description: b.description,
        url_text_source: b.url_text_source,
        language: b.language,
        copyright_year: b.copyright_year,
        num_sections: b.num_sections,
        url_rss: b.url_rss,
        url_zip_file: b.url_zip_file,
        url_project: b.url_project,
        url_librivox: b.url_librivox,
        total_time: b.totaltime,
        authors: ((b.authors as Array<Record<string, unknown>>) ?? []).map((a) => ({
          first_name: a.first_name,
          last_name: a.last_name,
          dob: a.dob,
          dod: a.dod,
        })),
        sections: sections.map((s) => ({
          section_number: s.section_number,
          title: s.title,
          listen_url: s.listen_url,
          playtime: s.playtime,
        })),
      };
    }

    return {
      total: list.length,
      books: list.map((b) => ({
        id: b.id,
        title: b.title,
        description:
          typeof b.description === 'string' ? b.description.slice(0, 400) : b.description,
        language: b.language,
        copyright_year: b.copyright_year,
        num_sections: b.num_sections,
        total_time: b.totaltime,
        url_rss: b.url_rss,
        url_zip_file: b.url_zip_file,
        url_librivox: b.url_librivox,
        authors: ((b.authors as Array<Record<string, unknown>>) ?? []).map((a) =>
          `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim(),
        ),
      })),
    };
  }
}
