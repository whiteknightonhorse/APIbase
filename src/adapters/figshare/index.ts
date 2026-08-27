import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

const ITEM_TYPE_IDS: Record<string, number> = {
  figure: 1,
  media: 2,
  dataset: 3,
  poster: 5,
  journal_contribution: 6,
  presentation: 7,
  thesis: 8,
  software: 9,
  online_resource: 11,
  preprint: 12,
  book: 13,
  conference_contribution: 14,
};

/**
 * Figshare adapter (UC-621) — JSON wrapper over Figshare's open research repository.
 * CC-licensed datasets, figures, papers, media. No auth, unlimited free reads.
 * https://api.figshare.com/v2
 */
export class FigshareAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'figshare', baseUrl: 'https://api.figshare.com/v2' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'figshare.search': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('search_for', String(p.query));
        if (p.doi) qs.set('doi', String(p.doi));
        if (p.item_type) {
          const itemTypeId = ITEM_TYPE_IDS[String(p.item_type)];
          if (itemTypeId) qs.set('item_type', String(itemTypeId));
        }
        const pageSize = Math.max(1, Math.min(50, Number(p.page_size ?? 10)));
        qs.set('page_size', String(pageSize));
        qs.set('page', String(Math.max(1, Number(p.page ?? 1))));
        qs.set('order', 'published_date');
        qs.set('order_direction', String(p.order_direction ?? 'desc'));
        return { url: `${this.baseUrl}/articles?${qs.toString()}`, method: 'GET', headers };
      }
      case 'figshare.article_details': {
        const id = encodeURIComponent(String(p.article_id));
        return { url: `${this.baseUrl}/articles/${id}`, method: 'GET', headers };
      }
      case 'figshare.categories': {
        return { url: `${this.baseUrl}/categories`, method: 'GET', headers };
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
    const params = req.params as Record<string, unknown>;

    if (req.toolId === 'figshare.search') {
      const results = raw.body as Array<Record<string, unknown>>;
      return {
        returned: results.length,
        articles: results.map(simplifyArticleSummary),
      };
    }

    if (req.toolId === 'figshare.article_details') {
      return simplifyArticleDetails(raw.body as Record<string, unknown>);
    }

    if (req.toolId === 'figshare.categories') {
      const categories = raw.body as Array<Record<string, unknown>>;
      const query = params.query ? String(params.query).toLowerCase() : undefined;
      const limit = Math.max(1, Math.min(200, Number(params.limit ?? 50)));
      const filtered = query
        ? categories.filter((c) =>
            String(c.title ?? '')
              .toLowerCase()
              .includes(query),
          )
        : categories;
      return {
        total: categories.length,
        returned: Math.min(limit, filtered.length),
        categories: filtered.slice(0, limit).map((c) => ({
          id: c.id,
          title: c.title,
          parent_id: c.parent_id,
          path: c.path,
          is_selectable: c.is_selectable,
        })),
      };
    }

    return raw.body;
  }
}

function simplifyArticleSummary(a: Record<string, unknown>): unknown {
  return {
    id: a.id,
    title: a.title,
    doi: a.doi,
    item_type: a.defined_type_name,
    published_date: a.published_date,
    url: a.url_public_html,
  };
}

function simplifyArticleDetails(a: Record<string, unknown>): unknown {
  const license = a.license as Record<string, unknown> | undefined;
  return {
    id: a.id,
    title: a.title,
    doi: a.doi,
    item_type: a.defined_type_name,
    description: a.description,
    citation: a.citation,
    authors: ((a.authors as Array<Record<string, unknown>>) ?? []).map((au) => ({
      full_name: au.full_name,
      orcid_id: au.orcid_id,
    })),
    tags: a.tags,
    categories: ((a.categories as Array<Record<string, unknown>>) ?? []).map((c) => c.title),
    license: license ? { name: license.name, url: license.url } : undefined,
    published_date: a.published_date,
    modified_date: a.modified_date,
    version: a.version,
    size_bytes: a.size,
    files: ((a.files as Array<Record<string, unknown>>) ?? []).map((f) => ({
      name: f.name,
      size: f.size,
      download_url: f.download_url,
      mimetype: f.mimetype,
    })),
    url: a.url_public_html,
  };
}
