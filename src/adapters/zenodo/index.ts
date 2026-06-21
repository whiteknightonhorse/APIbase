import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type {
  ZenodoRecord,
  ZenodoRecordMetadata,
  ZenodoSearchResponse,
  ZenodoFilesResponse,
  ZenodoCommunitySearchResponse,
  ZenodoCreator,
  ZenodoFile,
  ZenodoCommunity,
} from './types';

/**
 * Zenodo adapter (UC-461) — open-access research repository by CERN / OpenAIRE.
 * No auth required for read endpoints. CC0/CC BY licensed metadata.
 * https://zenodo.org/api
 */
export class ZenodoAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'zenodo', baseUrl: 'https://zenodo.org' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'zenodo.search': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('q', String(p.query));
        if (p.type) qs.set('type', String(p.type));
        if (p.sort) qs.set('sort', String(p.sort));
        const size = Math.max(1, Math.min(50, Number(p.limit ?? 10)));
        qs.set('size', String(size));
        if (p.page) qs.set('page', String(p.page));
        if (p.access_right) qs.set('access_right', String(p.access_right));
        if (p.date_from || p.date_to) {
          const from = p.date_from ? String(p.date_from) : '*';
          const to = p.date_to ? String(p.date_to) : '*';
          const existing = qs.get('q') ?? '';
          qs.set(
            'q',
            existing
              ? `${existing} AND publication_date:[${from} TO ${to}]`
              : `publication_date:[${from} TO ${to}]`,
          );
        }
        return { url: `${this.baseUrl}/api/records?${qs.toString()}`, method: 'GET', headers };
      }

      case 'zenodo.record': {
        const id = encodeURIComponent(String(p.record_id));
        return { url: `${this.baseUrl}/api/records/${id}`, method: 'GET', headers };
      }

      case 'zenodo.files': {
        const id = encodeURIComponent(String(p.record_id));
        return { url: `${this.baseUrl}/api/records/${id}/files`, method: 'GET', headers };
      }

      case 'zenodo.communities': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('q', String(p.query));
        const size = Math.max(1, Math.min(50, Number(p.limit ?? 10)));
        qs.set('size', String(size));
        if (p.page) qs.set('page', String(p.page));
        if (p.sort) qs.set('sort', String(p.sort));
        return { url: `${this.baseUrl}/api/communities?${qs.toString()}`, method: 'GET', headers };
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
    const body = raw.body as Record<string, unknown>;
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'zenodo.search': {
        const resp = body as unknown as ZenodoSearchResponse;
        const hits = resp.hits ?? { hits: [], total: 0 };
        const total =
          typeof hits.total === 'object'
            ? (hits.total as { value: number }).value
            : (hits.total as number);
        return {
          total,
          returned: hits.hits.length,
          records: hits.hits.map(simplifyRecord),
        };
      }

      case 'zenodo.record': {
        return simplifyRecord(body as unknown as ZenodoRecord);
      }

      case 'zenodo.files': {
        const resp = body as unknown as ZenodoFilesResponse;
        const limit = Math.max(1, Math.min(100, Number(p.limit ?? 50)));
        const entries = (resp.entries ?? []).slice(0, limit);
        return {
          total: resp.entries?.length ?? 0,
          returned: entries.length,
          files: entries.map(simplifyFile),
        };
      }

      case 'zenodo.communities': {
        const resp = body as unknown as ZenodoCommunitySearchResponse;
        const hits = resp.hits ?? { hits: [], total: 0 };
        const total =
          typeof hits.total === 'object'
            ? (hits.total as { value: number }).value
            : (hits.total as number);
        return {
          total,
          returned: hits.hits.length,
          communities: hits.hits.map(simplifyCommunity),
        };
      }

      default:
        return body;
    }
  }
}

function simplifyRecord(r: ZenodoRecord): unknown {
  const m: ZenodoRecordMetadata = r.metadata ?? { title: r.title ?? '' };
  return {
    id: r.id ?? r.recid,
    doi: r.doi ?? m.doi,
    doi_url: r.doi_url,
    title: r.title ?? m.title,
    type: m.resource_type?.type,
    subtype: m.resource_type?.subtype,
    publication_date: m.publication_date,
    access_right: m.access_right,
    creators: (m.creators ?? []).map((c: ZenodoCreator) => ({
      name: c.name,
      affiliation: c.affiliation,
      orcid: c.orcid,
    })),
    keywords: m.keywords ?? [],
    description: m.description ? stripHtml(String(m.description)) : undefined,
    license: m.license?.id,
    communities: (m.communities ?? []).map((c) => c.id).filter(Boolean),
    language: m.language,
    files_count: (r.files ?? []).length,
    stats: r.stats
      ? {
          views: r.stats.views,
          downloads: r.stats.downloads,
          unique_views: r.stats.unique_views,
          unique_downloads: r.stats.unique_downloads,
        }
      : undefined,
    record_url: r.links?.self_html ?? r.links?.html,
    created: r.created,
    updated: r.updated ?? r.modified,
  };
}

function simplifyFile(f: ZenodoFile): unknown {
  return {
    filename: f.key,
    mimetype: f.mimetype,
    size_bytes: f.size,
    checksum: f.checksum,
    download_url: f.links?.download ?? f.links?.self,
  };
}

function simplifyCommunity(c: ZenodoCommunity): unknown {
  const meta = c.metadata ?? {};
  return {
    id: c.slug ?? c.id,
    title: meta.title,
    description: meta.description ? stripHtml(String(meta.description)) : undefined,
    website: meta.website,
    type: meta.type,
    created: c.created,
    updated: c.updated,
    url: c.links?.self_html ?? c.links?.html,
  };
}
