import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CernSearchResponse, CernRecord } from './types';
import { stripHtml } from '../../utils/strip-html';

const API_BASE = 'https://opendata.cern.ch/api';
const UA = 'APIbase.pro/1.0 (https://apibase.pro; mailto:contact@apibase.pro)';

/**
 * CERN Open Data adapter (UC-475).
 *
 * Supported tools (read-only, no auth required):
 *   cernopendata.records.search   — Full-text search across 80K+ physics records
 *   cernopendata.records.detail   — Fetch full metadata for a record by ID
 *   cernopendata.datasets.browse  — Browse datasets by experiment, year, collision energy
 *   cernopendata.glossary.lookup  — Search the 1,000+ term HEP physics glossary
 *
 * Auth: None (CERN Open Data portal is fully public, CC0/CC-BY licensed).
 * API: https://opendata.cern.ch/api
 */
export class CernOpenDataAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'cernopendata', baseUrl: API_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': UA,
    };

    switch (req.toolId) {
      case 'cernopendata.records.search': {
        const qs = new URLSearchParams();
        if (p.q) qs.set('q', String(p.q));
        if (p.type) qs.set('type', String(p.type));
        if (p.experiment) qs.set('experiment', String(p.experiment));
        const limit = Math.min(Number(p.limit ?? 10), 25);
        const page = Math.max(Number(p.page ?? 1), 1);
        qs.set('size', String(limit));
        qs.set('page', String(page));
        qs.set('sort', 'mostrecent');
        return { url: `${API_BASE}/records/?${qs.toString()}`, method: 'GET', headers };
      }

      case 'cernopendata.records.detail': {
        const id = encodeURIComponent(String(p.id));
        return { url: `${API_BASE}/records/${id}`, method: 'GET', headers };
      }

      case 'cernopendata.datasets.browse': {
        const qs = new URLSearchParams();
        qs.set('type', 'Dataset');
        if (p.experiment) qs.set('experiment', String(p.experiment));
        if (p.year) qs.set('date_published', String(p.year));
        if (p.collision_energy) qs.set('collision_energy', String(p.collision_energy));
        if (p.q) qs.set('q', String(p.q));
        const limit = Math.min(Number(p.limit ?? 10), 25);
        const page = Math.max(Number(p.page ?? 1), 1);
        qs.set('size', String(limit));
        qs.set('page', String(page));
        qs.set('sort', 'mostrecent');
        return { url: `${API_BASE}/records/?${qs.toString()}`, method: 'GET', headers };
      }

      case 'cernopendata.glossary.lookup': {
        const qs = new URLSearchParams();
        qs.set('type', 'Glossary');
        if (p.term) qs.set('q', String(p.term));
        const limit = Math.min(Number(p.limit ?? 10), 25);
        qs.set('size', String(limit));
        qs.set('page', '1');
        return { url: `${API_BASE}/records/?${qs.toString()}`, method: 'GET', headers };
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
    switch (req.toolId) {
      case 'cernopendata.records.search':
      case 'cernopendata.datasets.browse': {
        const data = raw.body as CernSearchResponse;
        if (!data.hits) throw new Error('Missing hits in CERN search response');
        return {
          total: data.hits.total,
          records: data.hits.hits.map((h) => this.summarizeRecord(h)),
          next_page: data.links?.next ? this.extractPage(data.links.next) : null,
        };
      }

      case 'cernopendata.records.detail': {
        const data = raw.body as CernRecord;
        if (!data.id) throw new Error('Missing id in CERN record response');
        const m = data.metadata;
        return {
          id: data.id,
          title: m.title ?? '',
          type: m.type?.primary ?? '',
          subtype: m.type?.secondary ?? [],
          experiment: m.experiment ?? [],
          date_published: m.date_published ?? '',
          abstract: m.abstract ? stripHtml(m.abstract.description) : '',
          collections: m.collections ?? [],
          availability: m.availability ?? '',
          collision_energy: m.collision_energy ?? '',
          collision_type: m.collision_type ?? '',
          accelerator: m.accelerator ?? '',
          authors: (m.authors ?? []).map((a) => ({ name: a.name, orcid: a.orcid })),
          files_count: m.files?.length ?? 0,
          files: (m.files ?? []).slice(0, 5).map((f) => ({
            key: f.key,
            size_bytes: f.size,
            uri: f.uri ?? '',
          })),
          keywords: m.keywords ?? [],
          license: m.license?.attribution ?? '',
          run_period: m.run_period ?? [],
          links: (m.links ?? []).map((l) => ({ text: l.text ?? '', url: l.url })),
          updated: data.updated,
        };
      }

      case 'cernopendata.glossary.lookup': {
        const data = raw.body as CernSearchResponse;
        if (!data.hits) throw new Error('Missing hits in CERN glossary response');
        return {
          total: data.hits.total,
          terms: data.hits.hits.map((h) => {
            const m = h.metadata;
            return {
              id: h.id,
              term: m.title ?? m.anchor ?? h.id,
              aliases: m.term ?? [],
              definition: m.definition ?? '',
              category: m.category ?? '',
              see_also: (m.see_also ?? []).map((s) => s.term),
              links: (m.links ?? []).map((l) => ({ text: l.text ?? '', url: l.url })),
            };
          }),
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

  private summarizeRecord(h: CernRecord): Record<string, unknown> {
    const m = h.metadata;
    return {
      id: h.id,
      title: m.title ?? '',
      type: m.type?.primary ?? '',
      subtype: m.type?.secondary?.[0] ?? '',
      experiment: m.experiment ?? [],
      date_published: m.date_published ?? '',
      availability: m.availability ?? '',
      collision_energy: m.collision_energy ?? '',
      abstract_snippet: m.abstract ? stripHtml(m.abstract.description).slice(0, 200) : '',
      collections: m.collections ?? [],
    };
  }

  private extractPage(url: string): number | null {
    try {
      const u = new URL(url);
      const p = u.searchParams.get('page');
      return p ? parseInt(p, 10) : null;
    } catch {
      return null;
    }
  }
}
