import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CmrCollectionsResponse,
  CmrUmmCollectionsResponse,
  CmrGranulesResponse,
  CmrProvidersResponse,
} from './types';

/**
 * NASA CMR (Common Metadata Repository) adapter (UC-578).
 *
 * Supported tools (read-only):
 *   nasa-cmr.search_collections → GET /search/collections.json
 *   nasa-cmr.collection_detail  → GET /search/collections.umm_json?concept_id=
 *   nasa-cmr.search_granules    → GET /search/granules.json
 *   nasa-cmr.list_providers     → GET /search/providers
 *
 * Auth: None (NASA open data / US Gov public domain).
 * Docs: https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html
 */
export class NasaCmrAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'nasa-cmr',
      baseUrl: 'https://cmr.earthdata.nasa.gov/search',
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
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'nasa-cmr.search_collections':
        return this.buildSearchCollectionsRequest(params, headers);
      case 'nasa-cmr.collection_detail':
        return this.buildCollectionDetailRequest(params, headers);
      case 'nasa-cmr.search_granules':
        return this.buildSearchGranulesRequest(params, headers);
      case 'nasa-cmr.list_providers':
        return this.buildListProvidersRequest(params, headers);
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
      case 'nasa-cmr.search_collections': {
        const data = body as CmrCollectionsResponse;
        const entries = data.feed?.entry ?? [];
        return {
          count: entries.length,
          collections: entries.map((e) => ({
            concept_id: e.id,
            title: e.title,
            summary: e.summary,
            short_name: e.short_name,
            version: e.version_id,
            data_center: e.data_center ?? e.archive_center,
            processing_level: e.processing_level_id,
            time_start: e.time_start,
            time_end: e.time_end,
            cloud_hosted: e.cloud_hosted,
            online_access: e.online_access_flag,
            updated: e.updated,
          })),
        };
      }

      case 'nasa-cmr.collection_detail': {
        const data = body as CmrUmmCollectionsResponse;
        if (!data.items || data.items.length === 0) {
          throw new Error('Collection not found');
        }
        const item = data.items[0];
        const umm = item.umm;
        const meta = item.meta;
        const temporal = umm.TemporalExtents?.[0]?.RangeDateTimes?.[0];
        return {
          concept_id: meta['concept-id'],
          provider_id: meta['provider-id'],
          short_name: umm.ShortName,
          version: umm.Version,
          title: umm.EntryTitle,
          abstract: umm.Abstract,
          processing_level: umm.ProcessingLevel?.Id,
          collection_type: umm.CollectionDataType,
          time_start: temporal?.BeginningDateTime,
          time_end: temporal?.EndingDateTime,
          platforms: (umm.Platforms ?? []).map((p) => ({
            name: p.ShortName,
            type: p.Type,
            instruments: (p.Instruments ?? []).map((i) => i.ShortName),
          })),
          science_keywords: (umm.ScienceKeywords ?? []).map((k) => ({
            category: k.Category,
            topic: k.Topic,
            term: k.Term,
            variable: k.VariableLevel1,
          })),
          doi: umm.DOI?.DOI,
          related_urls: (umm.RelatedUrls ?? [])
            .filter((u) => u.URL)
            .slice(0, 5)
            .map((u) => ({ url: u.URL, type: u.Type, description: u.Description })),
          data_centers: (umm.DataCenters ?? []).map((c) => c.ShortName),
        };
      }

      case 'nasa-cmr.search_granules': {
        const data = body as CmrGranulesResponse;
        const entries = data.feed?.entry ?? [];
        return {
          count: entries.length,
          granules: entries.map((g) => {
            const downloads = (g.links ?? [])
              .filter((l) => l.rel?.includes('download') && l.href)
              .map((l) => l.href as string);
            return {
              granule_id: g.id,
              title: g.title,
              producer_id: g.producer_granule_id,
              collection_concept_id: g.collection_concept_id,
              data_center: g.data_center,
              time_start: g.time_start,
              time_end: g.time_end,
              day_night: g.day_night_flag,
              cloud_cover_pct: g.cloud_cover,
              size_mb: g.granule_size,
              online_access: g.online_access_flag,
              browse_available: g.browse_flag,
              download_urls: downloads,
              updated: g.updated,
            };
          }),
        };
      }

      case 'nasa-cmr.list_providers': {
        const data = body as CmrProvidersResponse;
        return {
          total: data.hits,
          count: (data.items ?? []).length,
          providers: (data.items ?? []).map((p) => ({
            provider_id: p.ProviderId,
            description: p.DescriptionOfHolding?.slice(0, 200),
            organizations: (p.Organizations ?? []).map((o) => ({
              short_name: o.ShortName,
              long_name: o.LongName,
              url: o.URLValue,
              roles: o.Roles,
            })),
            consortiums: p.Consortiums,
          })),
        };
      }

      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchCollectionsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.keyword) qs.set('keyword', String(params.keyword));
    if (params.provider) qs.set('data_center', String(params.provider));
    if (params.short_name) qs.set('short_name', String(params.short_name));
    if (params.temporal_start || params.temporal_end) {
      const start = params.temporal_start ? String(params.temporal_start) : '';
      const end = params.temporal_end ? String(params.temporal_end) : '';
      qs.set('temporal', `${start},${end}`);
    }
    if (params.bbox) qs.set('bounding_box', String(params.bbox));
    if (params.processing_level) qs.set('processing_level_id[]', String(params.processing_level));
    const pageSize = params.page_size ? Math.min(Number(params.page_size), 20) : 10;
    qs.set('page_size', String(pageSize));
    const sortKey = params.sort_key ? String(params.sort_key) : '-score';
    qs.set('sort_key[]', sortKey);

    return {
      url: `${this.baseUrl}/collections.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildCollectionDetailRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const conceptId = encodeURIComponent(String(params.concept_id ?? ''));
    return {
      url: `${this.baseUrl}/collections.umm_json?concept_id=${conceptId}`,
      method: 'GET',
      headers,
    };
  }

  private buildSearchGranulesRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.collection_concept_id)
      qs.set('collection_concept_id', String(params.collection_concept_id));
    if (params.short_name) qs.set('short_name', String(params.short_name));
    if (params.temporal_start || params.temporal_end) {
      const start = params.temporal_start ? String(params.temporal_start) : '';
      const end = params.temporal_end ? String(params.temporal_end) : '';
      qs.set('temporal', `${start},${end}`);
    }
    if (params.bbox) qs.set('bounding_box', String(params.bbox));
    if (params.day_night_flag) qs.set('day_night_flag', String(params.day_night_flag));
    const pageSize = params.page_size ? Math.min(Number(params.page_size), 20) : 10;
    qs.set('page_size', String(pageSize));
    qs.set('sort_key[]', '-start_date');

    return {
      url: `${this.baseUrl}/granules.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildListProvidersRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const pageSize = params.page_size ? Math.min(Number(params.page_size), 100) : 50;
    qs.set('page_size', String(pageSize));

    return {
      url: `${this.baseUrl}/providers?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
