import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type {
  CrossrefWorksResponse,
  CrossrefJournalResponse,
  CrossrefFundersResponse,
  CrossrefMembersResponse,
  CrossrefWorksSearchOutput,
  CrossrefJournalOutput,
  CrossrefFunderSearchOutput,
  CrossrefMemberSearchOutput,
} from './types';

const CROSSREF_BASE = 'https://api.crossref.org';
const WORKS_SELECT =
  'DOI,title,author,type,publisher,container-title,issued,URL,is-referenced-by-count,abstract';

/**
 * CrossRef REST API adapter (UC-597).
 *
 * Supported tools:
 *   crossref.works_search   -> /works?query=...    scholarly work search
 *   crossref.journal_lookup -> /journals/{issn}     journal metadata by ISSN
 *   crossref.funder_search  -> /funders?query=...   funder registry search
 *   crossref.member_search  -> /members?query=...   publisher/member registry search
 *
 * Auth: None. Public "polite pool" API — a descriptive User-Agent with a
 * mailto contact is sent to get priority rate limits (self-reported by
 * CrossRef; no API key involved). CC0/open metadata, no auth required.
 */
export class CrossrefAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'crossref', baseUrl: CROSSREF_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro; mailto:infocitysms@gmail.com)',
    };

    switch (req.toolId) {
      case 'crossref.works_search': {
        const query = String(params.query || '').trim();
        if (!query) {
          throw this.invalidInput(req.toolId, 'query is required');
        }
        const rows = Math.min(Math.max(Number(params.rows) || 10, 1), 20);
        const qs = new URLSearchParams();
        qs.set('query', query);
        qs.set('rows', String(rows));
        qs.set('select', WORKS_SELECT);
        return { url: `${CROSSREF_BASE}/works?${qs.toString()}`, method: 'GET', headers };
      }

      case 'crossref.journal_lookup': {
        const issn = String(params.issn || '').trim();
        if (!issn) {
          throw this.invalidInput(req.toolId, 'issn is required');
        }
        return {
          url: `${CROSSREF_BASE}/journals/${encodeURIComponent(issn)}`,
          method: 'GET',
          headers,
        };
      }

      case 'crossref.funder_search': {
        const query = String(params.query || '').trim();
        if (!query) {
          throw this.invalidInput(req.toolId, 'query is required');
        }
        const rows = Math.min(Math.max(Number(params.rows) || 10, 1), 20);
        const qs = new URLSearchParams();
        qs.set('query', query);
        qs.set('rows', String(rows));
        return { url: `${CROSSREF_BASE}/funders?${qs.toString()}`, method: 'GET', headers };
      }

      case 'crossref.member_search': {
        const query = String(params.query || '').trim();
        if (!query) {
          throw this.invalidInput(req.toolId, 'query is required');
        }
        const rows = Math.min(Math.max(Number(params.rows) || 10, 1), 20);
        const qs = new URLSearchParams();
        qs.set('query', query);
        qs.set('rows', String(rows));
        return { url: `${CROSSREF_BASE}/members?${qs.toString()}`, method: 'GET', headers };
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
      case 'crossref.works_search':
        return this.parseWorksSearch(raw.body as CrossrefWorksResponse);
      case 'crossref.journal_lookup':
        return this.parseJournal(raw.body as CrossrefJournalResponse);
      case 'crossref.funder_search':
        return this.parseFunderSearch(raw.body as CrossrefFundersResponse);
      case 'crossref.member_search':
        return this.parseMemberSearch(raw.body as CrossrefMembersResponse);
      default:
        return raw.body;
    }
  }

  private parseWorksSearch(data: CrossrefWorksResponse): CrossrefWorksSearchOutput {
    const msg = data.message;
    return {
      total: msg['total-results'] ?? 0,
      results: (msg.items ?? []).map((w) => ({
        doi: w.DOI,
        title: w.title?.[0] ?? '',
        authors: (w.author ?? []).map(
          (a) => a.name ?? [a.given, a.family].filter(Boolean).join(' '),
        ),
        type: w.type ?? '',
        publisher: w.publisher ?? '',
        container_title: w['container-title']?.[0] ?? null,
        published_date: this.formatDateParts(w.issued?.['date-parts']?.[0]),
        url: w.URL ?? null,
        citation_count: w['is-referenced-by-count'] ?? 0,
        abstract: w.abstract ? stripHtml(w.abstract).slice(0, 1000) : null,
      })),
    };
  }

  private parseJournal(data: CrossrefJournalResponse): CrossrefJournalOutput {
    const j = data.message;
    return {
      issn: j.ISSN?.[0] ?? '',
      title: j.title ?? '',
      publisher: j.publisher ?? '',
      subjects: j.subjects ?? [],
      total_dois: j.counts?.['total-dois'] ?? 0,
      current_dois: j.counts?.['current-dois'] ?? 0,
      backfile_dois: j.counts?.['backfile-dois'] ?? 0,
    };
  }

  private parseFunderSearch(data: CrossrefFundersResponse): CrossrefFunderSearchOutput {
    const msg = data.message;
    return {
      total: msg['total-results'] ?? 0,
      results: (msg.items ?? []).map((f) => ({
        funder_id: f.id,
        name: f.name,
        alt_names: f['alt-names'] ?? [],
        location: f.location ?? null,
        uri: f.uri ?? null,
      })),
    };
  }

  private parseMemberSearch(data: CrossrefMembersResponse): CrossrefMemberSearchOutput {
    const msg = data.message;
    return {
      total: msg['total-results'] ?? 0,
      results: (msg.items ?? []).map((m) => ({
        member_id: m.id,
        primary_name: m['primary-name'],
        location: m.location ?? null,
        total_dois: m.counts?.['total-dois'] ?? 0,
        current_dois: m.counts?.['current-dois'] ?? 0,
        prefixes: (m.prefixes ?? []).slice(0, 10),
      })),
    };
  }

  private formatDateParts(parts?: number[]): string | null {
    if (!parts || parts.length === 0) return null;
    const [y, m, d] = parts;
    if (!y) return null;
    const mm = String(m ?? 1).padStart(2, '0');
    const dd = String(d ?? 1).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}
