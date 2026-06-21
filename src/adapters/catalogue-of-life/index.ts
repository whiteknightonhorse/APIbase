import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ColName,
  ColSearchResponse,
  ColNameUsageDetail,
  ColSuggestion,
  ColNameUsageResult,
  ColTaxonSummary,
  ColSearchOutput,
  ColDetailOutput,
  ColSuggestOutput,
  ColChildrenOutput,
} from './types';

const COL_BASE = 'https://api.catalogueoflife.org';
/** Catalogue of Life uses dataset key 3 for the main COL working draft. */
const DATASET = '3';

/**
 * Catalogue of Life adapter (UC-492).
 * Comprehensive catalogue of ~10M known species. CC BY 4.0. No auth, unlimited.
 */
export class CatalogueOfLifeAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'col', baseUrl: COL_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const base = `${COL_BASE}/dataset/${DATASET}`;

    switch (req.toolId) {
      case 'col.search': {
        const qp = new URLSearchParams();
        qp.set('q', String(params.query));
        if (params.rank) qp.set('rank', String(params.rank).toUpperCase());
        if (params.status) qp.set('status', String(params.status));
        qp.set('limit', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('offset', String(Number(params.offset) || 0));
        return { url: `${base}/nameusage/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'col.detail': {
        const id = encodeURIComponent(String(params.taxon_id));
        return { url: `${base}/nameusage/${id}`, method: 'GET', headers };
      }

      case 'col.suggest': {
        const qp = new URLSearchParams();
        qp.set('q', String(params.query));
        if (params.rank) qp.set('rank', String(params.rank).toUpperCase());
        qp.set('limit', String(Math.min(Number(params.limit) || 10, 25)));
        return { url: `${base}/nameusage/suggest?${qp.toString()}`, method: 'GET', headers };
      }

      case 'col.children': {
        const qp = new URLSearchParams();
        qp.set('TAXON_ID', String(params.taxon_id));
        qp.set('limit', String(Math.min(Number(params.limit) || 20, 100)));
        qp.set('offset', String(Number(params.offset) || 0));
        return { url: `${base}/nameusage/search?${qp.toString()}`, method: 'GET', headers };
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

    switch (req.toolId) {
      case 'col.search':
        return this.parseSearch(body as unknown as ColSearchResponse);
      case 'col.detail':
        return this.parseDetail(body as unknown as ColNameUsageDetail);
      case 'col.suggest':
        return this.parseSuggest(body as unknown as ColSuggestion[]);
      case 'col.children':
        return this.parseChildren(
          body as unknown as ColSearchResponse,
          String((req.params as Record<string, unknown>).taxon_id),
        );
      default:
        return body;
    }
  }

  private parseSearch(body: ColSearchResponse): ColSearchOutput {
    return {
      total: body.total ?? 0,
      offset: body.offset ?? 0,
      results: (body.result ?? []).map((r) => this.toTaxonSummary(r)),
    };
  }

  private parseDetail(body: ColNameUsageDetail): ColDetailOutput {
    const name: ColName = body.name ?? ({} as ColName);
    return {
      id: body.id ?? '',
      scientific_name: name.scientificName ?? body.label ?? '',
      authorship: name.authorship ?? '',
      rank: name.rank ?? '',
      status: body.status ?? '',
      extinct: body.extinct ?? false,
      group: '',
      kingdom: '',
      phylum: '',
      class_name: '',
      order: '',
      family: '',
      genus: this.extractGenus(name.scientificName ?? ''),
      vernacular_names: [],
      parent_id: body.parentId ?? '',
      scrutinizer: body.scrutinizer ?? '',
      scrutinizer_date: body.scrutinizerDate ?? '',
      link: body.link ?? '',
    };
  }

  private parseSuggest(items: ColSuggestion[]): ColSuggestOutput {
    const list = Array.isArray(items) ? items : [];
    return {
      suggestions: list.map((s) => ({
        usage_id: s.usageId ?? '',
        match: s.match ?? '',
        rank: s.rank ?? '',
        status: s.status ?? '',
        group: s.group ?? '',
        context: s.context ?? '',
        suggestion: s.suggestion ?? s.match ?? '',
      })),
    };
  }

  private parseChildren(body: ColSearchResponse, parentId: string): ColChildrenOutput {
    return {
      parent_id: parentId,
      total: body.total ?? 0,
      results: (body.result ?? []).map((r) => this.toTaxonSummary(r)),
    };
  }

  private toTaxonSummary(r: ColNameUsageResult): ColTaxonSummary {
    const usage = r.usage ?? {};
    const name: ColName = (usage.name ?? {}) as ColName;
    const cls = r.classification ?? [];

    const getByRank = (rank: string): string => cls.find((c) => c.rank === rank)?.name ?? '';

    const vernacular = (r.vernacularNames ?? [])
      .filter((v) => !v.language || v.language === 'eng' || v.language === 'en')
      .map((v) => v.name)
      .slice(0, 5);

    return {
      id: r.id ?? '',
      scientific_name: name.scientificName ?? usage.label ?? '',
      authorship: name.authorship ?? '',
      rank: name.rank ?? '',
      status: usage.status ?? '',
      extinct: usage.extinct ?? false,
      group: r.group ?? '',
      kingdom: getByRank('kingdom'),
      phylum: getByRank('phylum'),
      class_name: getByRank('class'),
      order: getByRank('order'),
      family: getByRank('family'),
      genus: getByRank('genus') || this.extractGenus(name.scientificName ?? ''),
      vernacular_names: vernacular,
    };
  }

  private extractGenus(scientificName: string): string {
    return scientificName.split(' ')[0] ?? '';
  }
}
