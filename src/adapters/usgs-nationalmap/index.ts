import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { TnmDatasetRaw, TnmProductRaw, TnmProductsApiResponse } from './types';

const TNM_BASE = 'https://tnmaccess.nationalmap.gov';

const DEFAULT_MAX = 10;
const HARD_MAX = 50;

/**
 * USGS The National Map (TNM) Access API adapter (UC-611).
 *
 * Supported tools (read-only):
 *   usgs-nationalmap.search_products  → GET /api/v1/products
 *   usgs-nationalmap.list_datasets    → GET /api/v1/datasets
 *
 * Auth: None (US Government open data, public domain — USGS National Geospatial
 * Program). The `/products` catalog is unbounded (~19M rows across all US
 * geospatial data holdings — topo maps, elevation/lidar, hydrography, imagery,
 * boundaries, structures) so a bounding box is required to keep queries scoped;
 * `total` reflects the full match count while `items` is always capped to the
 * requested `max` (default 10, hard cap 50) to stay within the response size
 * budget, matching the NSF Awards adapter's total_count/returned_count pattern.
 *
 * Upstream quirk: malformed query params (e.g. non-numeric bbox) are reported
 * as an `errorMessage` field in an HTTP 200 body rather than a 4xx status, so
 * parseResponse checks for it explicitly (same class as the NSF Awards
 * `serviceNotification` check).
 */
export class UsgsNationalMapAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'usgs-nationalmap',
      baseUrl: TNM_BASE,
      timeoutMs: 15_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'usgs-nationalmap.search_products':
        return this.buildSearchProductsRequest(params, headers);
      case 'usgs-nationalmap.list_datasets':
        return { url: `${this.baseUrl}/api/v1/datasets`, method: 'GET', headers };
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
      case 'usgs-nationalmap.search_products': {
        const data = raw.body as unknown as TnmProductsApiResponse;
        if (data.errorMessage) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `TNM Access API rejected the request: ${data.errorMessage}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        const items = data.items ?? [];
        const limit = clampMax((req.params as Record<string, unknown>)?.max);
        return {
          total_count: data.total ?? 0,
          returned_count: Math.min(items.length, limit),
          products: items.slice(0, limit).map((p) => this.toProductSummary(p)),
        };
      }
      case 'usgs-nationalmap.list_datasets': {
        const datasets = raw.body as unknown as TnmDatasetRaw[];
        const category = (req.params as Record<string, unknown>)?.category as string | undefined;
        const filtered = category
          ? datasets.filter(
              (d) => (d.parentCategory ?? '').toLowerCase() === category.toLowerCase(),
            )
          : datasets;
        return {
          count: filtered.length,
          datasets: filtered.map((d) => this.toDatasetSummary(d)),
        };
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchProductsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const minLat = Number(params.min_lat);
    const minLon = Number(params.min_lon);
    const maxLat = Number(params.max_lat);
    const maxLon = Number(params.max_lon);

    if (
      !Number.isFinite(minLat) ||
      !Number.isFinite(minLon) ||
      !Number.isFinite(maxLat) ||
      !Number.isFinite(maxLon)
    ) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'min_lat, min_lon, max_lat, and max_lon are all required and must be numeric.',
        provider: this.provider,
        toolId: 'usgs-nationalmap.search_products',
        durationMs: 0,
      };
    }

    if (minLat >= maxLat || minLon >= maxLon) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'min_lat must be less than max_lat, and min_lon must be less than max_lon.',
        provider: this.provider,
        toolId: 'usgs-nationalmap.search_products',
        durationMs: 0,
      };
    }

    const qs = new URLSearchParams();
    // TNM bbox order is minX,minY,maxX,maxY (lon,lat,lon,lat).
    qs.set('bbox', `${minLon},${minLat},${maxLon},${maxLat}`);
    if (params.keyword) qs.set('q', String(params.keyword));
    if (params.datasets) qs.set('datasets', String(params.datasets));
    if (params.formats) qs.set('prodFormats', String(params.formats));
    qs.set('max', String(clampMax(params.max)));

    return { url: `${this.baseUrl}/api/v1/products?${qs.toString()}`, method: 'GET', headers };
  }

  // ---------------------------------------------------------------------------
  // Response shaping
  // ---------------------------------------------------------------------------

  private toProductSummary(p: TnmProductRaw): Record<string, unknown> {
    const info = p.moreInfo ?? '';
    return {
      title: p.title,
      description_excerpt:
        info.length > 300 ? `${info.slice(0, 300).trimEnd()}...` : info || undefined,
      source_id: p.sourceId,
      source_name: p.sourceName,
      format: p.format,
      extent: p.extent,
      size_bytes: p.sizeInBytes,
      publication_date: p.publicationDate,
      last_updated: p.lastUpdated,
      download_url: p.downloadURL,
      preview_url: p.previewGraphicURL,
      meta_url: p.metaUrl,
      bounding_box: p.boundingBox,
    };
  }

  private toDatasetSummary(d: TnmDatasetRaw): Record<string, unknown> {
    return {
      id: d.id,
      title: d.title,
      category: d.parentCategory,
      description: d.description,
      refresh_cycle: d.refreshCycle,
      default_extent: d.defaultExtent,
      formats: (d.formats ?? []).map((f) => f.displayName).filter(Boolean),
      info_url: d.infoUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampMax(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX;
  return Math.min(Math.trunc(n), HARD_MAX);
}
