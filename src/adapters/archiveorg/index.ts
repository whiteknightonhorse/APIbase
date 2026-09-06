import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ArchiveOrgSearchResponse,
  ArchiveOrgMetadataResponse,
  WaybackAvailableResponse,
} from './types';

/**
 * Internet Archive adapter (UC-735).
 *
 * Supported tools (read-only):
 *   archiveorg.search        → GET archive.org/advancedsearch.php?q=...
 *   archiveorg.metadata      → GET archive.org/metadata/{identifier}
 *   archiveorg.wayback_check → GET archive.org/wayback/available?url=...
 *
 * Auth: None. archive.org's search/metadata/Wayback APIs are free and
 * public — no API key or registration required.
 */
export class ArchiveOrgAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'archiveorg',
      baseUrl: 'https://archive.org',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro; hello@apibase.pro)',
    };

    switch (req.toolId) {
      case 'archiveorg.search':
        return this.buildSearchRequest(params, headers);
      case 'archiveorg.metadata':
        return {
          url: `${this.baseUrl}/metadata/${encodeURIComponent(String(params.identifier))}`,
          method: 'GET',
          headers,
        };
      case 'archiveorg.wayback_check':
        return this.buildWaybackRequest(params, headers);
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
    const body = raw.body;

    switch (req.toolId) {
      case 'archiveorg.search': {
        const d = body as unknown as ArchiveOrgSearchResponse;
        const docs = d.response?.docs ?? [];
        return {
          total: d.response?.numFound ?? 0,
          start: d.response?.start ?? 0,
          results: docs.map((doc) => ({
            identifier: doc.identifier,
            title: doc.title ?? null,
            mediatype: doc.mediatype ?? null,
            creator: doc.creator ?? null,
            date: doc.date ?? null,
            description: firstString(doc.description)?.slice(0, 500) ?? null,
            downloads: doc.downloads ?? null,
            subject: doc.subject ?? null,
            details_url: `https://archive.org/details/${doc.identifier}`,
          })),
        };
      }
      case 'archiveorg.metadata': {
        const d = body as unknown as ArchiveOrgMetadataResponse;
        const m = d.metadata ?? {};
        const files = (d.files ?? []).slice(0, 20).map((f) => ({
          name: f.name,
          format: f.format ?? null,
          size: f.size ?? null,
        }));
        return {
          identifier: m.identifier ?? null,
          title: m.title ?? null,
          creator: m.creator ?? null,
          description: firstString(m.description)?.slice(0, 1000) ?? null,
          date: m.date ?? null,
          mediatype: m.mediatype ?? null,
          subject: m.subject ?? null,
          collection: m.collection ?? null,
          licenseurl: m.licenseurl ?? null,
          item_size_bytes: d.item_size ?? null,
          files_count: d.files_count ?? files.length,
          files,
          details_url: m.identifier ? `https://archive.org/details/${m.identifier}` : null,
        };
      }
      case 'archiveorg.wayback_check': {
        const d = body as unknown as WaybackAvailableResponse;
        const closest = d.archived_snapshots?.closest;
        return {
          url: d.url,
          available: closest?.available ?? false,
          archived_url: closest?.url ?? null,
          timestamp: closest?.timestamp ?? null,
          status: closest?.status ?? null,
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    let q = params.query ? String(params.query) : '*';
    if (params.mediatype) q += ` AND mediatype:(${String(params.mediatype)})`;
    if (params.creator) q += ` AND creator:("${String(params.creator)}")`;

    const qs = new URLSearchParams();
    qs.set('q', q);
    for (const field of [
      'identifier',
      'title',
      'mediatype',
      'creator',
      'date',
      'description',
      'downloads',
      'subject',
    ]) {
      qs.append('fl[]', field);
    }
    qs.set('rows', String(Math.min(Number(params.rows ?? 10), 50)));
    qs.set('page', String(params.page ?? 1));
    qs.set('output', 'json');

    return { url: `${this.baseUrl}/advancedsearch.php?${qs.toString()}`, method: 'GET', headers };
  }

  private buildWaybackRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams({ url: String(params.url) });
    if (params.timestamp) qs.set('timestamp', String(params.timestamp));
    return { url: `${this.baseUrl}/wayback/available?${qs.toString()}`, method: 'GET', headers };
  }
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
