import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type {
  WikimediaSearchResponse,
  WikimediaSearchOutput,
  WikimediaFileInfoResponse,
  WikimediaFileInfoOutput,
  WikimediaExtMetadataField,
  WikimediaCategoryResponse,
  WikimediaCategoryOutput,
  WikimediaRandomResponse,
  WikimediaRandomOutput,
} from './types';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'APIbase/1.0 (https://apibase.pro; contact@apibase.pro)';
const FILE_URL_PREFIX = 'https://commons.wikimedia.org/wiki/';

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function extField(
  meta: Record<string, WikimediaExtMetadataField> | undefined,
  key: string,
): string | null {
  const raw = meta?.[key]?.value;
  if (!raw) return null;
  return stripHtml(raw);
}

/**
 * Wikimedia Commons API adapter (UC-599).
 *
 * Supported tools:
 *   wikimedia-commons.search         -> action=query&list=search (namespace 6 = File)
 *   wikimedia-commons.file_info      -> action=query&prop=imageinfo (URL, size, license, metadata)
 *   wikimedia-commons.category_files -> action=query&list=categorymembers (files in a category)
 *   wikimedia-commons.random         -> action=query&list=random (namespace 6 = File)
 *
 * Auth: None. Public MediaWiki Action API, no key required. Wikimedia's User-Agent
 * policy (meta.wikimedia.org/wiki/User-Agent_policy) requires a descriptive UA
 * identifying the application and a contact — not a credential, hardcoded here
 * like the polite-pool contact email used by other CC0/public-domain adapters.
 */
export class WikimediaCommonsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'wikimedia-commons', baseUrl: COMMONS_API });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };

    switch (req.toolId) {
      case 'wikimedia-commons.search': {
        const query = String(params.query || '').trim();
        if (!query) {
          throw this.invalidInput(req.toolId, 'query is required');
        }
        const limit = clamp(Number(params.limit ?? 10), 1, 50);
        const qs = new URLSearchParams({
          action: 'query',
          list: 'search',
          srsearch: query,
          srnamespace: '6',
          srlimit: String(limit),
          format: 'json',
        });
        return { url: `${COMMONS_API}?${qs.toString()}`, method: 'GET', headers };
      }

      case 'wikimedia-commons.file_info': {
        const rawTitle = String(params.title || '').trim();
        if (!rawTitle) {
          throw this.invalidInput(req.toolId, 'title is required');
        }
        const title = /^file:/i.test(rawTitle) ? rawTitle : `File:${rawTitle}`;
        const qs = new URLSearchParams({
          action: 'query',
          titles: title,
          prop: 'imageinfo',
          iiprop: 'url|size|mime|extmetadata',
          format: 'json',
        });
        return { url: `${COMMONS_API}?${qs.toString()}`, method: 'GET', headers };
      }

      case 'wikimedia-commons.category_files': {
        const rawCategory = String(params.category || '').trim();
        if (!rawCategory) {
          throw this.invalidInput(req.toolId, 'category is required');
        }
        const category = /^category:/i.test(rawCategory) ? rawCategory : `Category:${rawCategory}`;
        const limit = clamp(Number(params.limit ?? 20), 1, 50);
        const qs = new URLSearchParams({
          action: 'query',
          list: 'categorymembers',
          cmtitle: category,
          cmnamespace: '6',
          cmlimit: String(limit),
          format: 'json',
        });
        const cursor = params.cursor ? String(params.cursor) : '';
        if (cursor) qs.set('cmcontinue', cursor);
        return { url: `${COMMONS_API}?${qs.toString()}`, method: 'GET', headers };
      }

      case 'wikimedia-commons.random': {
        const count = clamp(Number(params.count ?? 5), 1, 20);
        const qs = new URLSearchParams({
          action: 'query',
          list: 'random',
          rnnamespace: '6',
          rnlimit: String(count),
          format: 'json',
        });
        return { url: `${COMMONS_API}?${qs.toString()}`, method: 'GET', headers };
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
      case 'wikimedia-commons.search':
        return this.parseSearch(
          raw.body as WikimediaSearchResponse,
          req.params as Record<string, unknown>,
        );
      case 'wikimedia-commons.file_info':
        return this.parseFileInfo(raw.body as WikimediaFileInfoResponse);
      case 'wikimedia-commons.category_files':
        return this.parseCategory(
          raw.body as WikimediaCategoryResponse,
          req.params as Record<string, unknown>,
        );
      case 'wikimedia-commons.random':
        return this.parseRandom(raw.body as WikimediaRandomResponse);
      default:
        return raw.body;
    }
  }

  private parseSearch(
    data: WikimediaSearchResponse,
    params: Record<string, unknown>,
  ): WikimediaSearchOutput {
    const results = data.query?.search ?? [];
    return {
      query: String(params.query || ''),
      total_hits: data.query?.searchinfo?.totalhits ?? results.length,
      results: results.map((r) => ({
        title: r.title,
        page_id: r.pageid,
        snippet: r.snippet ? stripHtml(r.snippet) : '',
        size_bytes: r.size ?? null,
        timestamp: r.timestamp ?? null,
        url: `${FILE_URL_PREFIX}${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
      })),
    };
  }

  private parseFileInfo(data: WikimediaFileInfoResponse): WikimediaFileInfoOutput {
    const pages = data.query?.pages ?? {};
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined) {
      return {
        title: page?.title ?? '',
        page_id: null,
        found: false,
        url: null,
        description_url: null,
        width: null,
        height: null,
        size_bytes: null,
        mime: null,
        description: null,
        artist: null,
        credit: null,
        license: null,
        license_url: null,
        date: null,
        categories: [],
      };
    }
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata;
    const categoriesRaw = extField(meta, 'Categories');
    return {
      title: page.title,
      page_id: page.pageid ?? null,
      found: true,
      url: info?.url ?? null,
      description_url: info?.descriptionurl ?? null,
      width: info?.width ?? null,
      height: info?.height ?? null,
      size_bytes: info?.size ?? null,
      mime: info?.mime ?? null,
      description: extField(meta, 'ImageDescription'),
      artist: extField(meta, 'Artist'),
      credit: extField(meta, 'Credit'),
      license: extField(meta, 'LicenseShortName'),
      license_url: meta?.LicenseUrl?.value ?? null,
      date: extField(meta, 'DateTimeOriginal') ?? extField(meta, 'DateTime'),
      categories: categoriesRaw ? categoriesRaw.split('|').filter(Boolean) : [],
    };
  }

  private parseCategory(
    data: WikimediaCategoryResponse,
    params: Record<string, unknown>,
  ): WikimediaCategoryOutput {
    const members = data.query?.categorymembers ?? [];
    const rawCategory = String(params.category || '');
    return {
      category: /^category:/i.test(rawCategory) ? rawCategory : `Category:${rawCategory}`,
      files: members.map((m) => ({
        title: m.title,
        page_id: m.pageid,
        url: `${FILE_URL_PREFIX}${encodeURIComponent(m.title.replace(/ /g, '_'))}`,
      })),
      has_more: Boolean(data.continue?.cmcontinue),
      next_cursor: data.continue?.cmcontinue ?? null,
    };
  }

  private parseRandom(data: WikimediaRandomResponse): WikimediaRandomOutput {
    const items = data.query?.random ?? [];
    return {
      files: items.map((i) => ({
        title: i.title,
        page_id: i.id,
        url: `${FILE_URL_PREFIX}${encodeURIComponent(i.title.replace(/ /g, '_'))}`,
      })),
    };
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
