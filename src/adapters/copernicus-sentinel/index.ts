import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  StacItem,
  StacSearchResponse,
  StacCollectionsResponse,
  StacCollectionSummary,
} from './types';

const STAC_BASE = 'https://catalogue.dataspace.copernicus.eu/stac';
const DEFAULT_COLLECTION = 'sentinel-2-l2a';
const DEFAULT_RADIUS_KM = 20;
const KM_PER_DEGREE = 111; // approximation at the equator, adequate for a search-radius bbox

const HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'User-Agent': 'APIbase/1.0 (https://apibase.pro; satellite imagery metadata search)',
};

/**
 * Copernicus Data Space Ecosystem — Sentinel satellite imagery catalog adapter (UC-628).
 *
 * Tools (read-only, no auth required — public STAC catalog at
 * catalogue.dataspace.copernicus.eu, ESA/EU Copernicus open data):
 *   copernicus-sentinel.search_scenes   → find Sentinel scenes by area + date + cloud cover
 *   copernicus-sentinel.scene_detail    → full metadata + asset list for one scene
 *   copernicus-sentinel.list_collections → browse the 400+ available satellite/product collections
 *
 * Metadata-only: this wraps the public STAC search/browse API, which requires no
 * authentication. Actual band-pixel downloads (S3/OpenID) are a separate CDSE
 * flow requiring a free account and are out of scope — agents get imagery
 * discovery (which scene, when, how cloudy) plus a direct quicklook thumbnail
 * URL per scene, no credentials needed.
 */
export class CopernicusSentinelAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'copernicus-sentinel',
      baseUrl: STAC_BASE,
      timeoutMs: 15_000,
      maxResponseBytes: 4_000_000, // GET /collections without a keyword returns ~3.4MB
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const p = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'copernicus-sentinel.search_scenes':
        return {
          url: `${STAC_BASE}/search`,
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(buildSearchBody(p, req)),
        };

      case 'copernicus-sentinel.scene_detail': {
        const collection = requireNonEmptyString(p.collection, 'collection', req);
        const itemId = requireNonEmptyString(p.item_id, 'item_id', req);
        return {
          url: `${STAC_BASE}/collections/${encodeURIComponent(collection)}/items/${encodeURIComponent(itemId)}`,
          method: 'GET',
          headers: HEADERS,
        };
      }

      case 'copernicus-sentinel.list_collections':
        return {
          url: `${STAC_BASE}/collections?limit=500`,
          method: 'GET',
          headers: HEADERS,
        };

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unknown Copernicus Sentinel tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'copernicus-sentinel.search_scenes':
        return parseSearchScenes(raw.body as StacSearchResponse);

      case 'copernicus-sentinel.scene_detail':
        return parseSceneDetail(raw.body as StacItem);

      case 'copernicus-sentinel.list_collections': {
        const p = (req.params ?? {}) as Record<string, unknown>;
        return parseListCollections(raw.body as StacCollectionsResponse, p);
      }

      default:
        return raw.body;
    }
  }
}

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

function buildSearchBody(
  p: Record<string, unknown>,
  req: ProviderRequest,
): Record<string, unknown> {
  const collection =
    typeof p.collection === 'string' && p.collection.length > 0 ? p.collection : DEFAULT_COLLECTION;
  const startDate = requireDate(p.start_date, 'start_date', req);
  const endDate = requireDate(p.end_date, 'end_date', req);
  const bbox = resolveBbox(p, req);
  const limit = clampLimit(p.limit, 50, 10);

  const body: Record<string, unknown> = {
    collections: [collection],
    bbox,
    datetime: `${startDate}T00:00:00Z/${endDate}T23:59:59Z`,
    limit,
  };

  if (p.max_cloud_cover !== undefined && p.max_cloud_cover !== null) {
    const maxCloud = Number(p.max_cloud_cover);
    if (!Number.isFinite(maxCloud) || maxCloud < 0 || maxCloud > 100) {
      throw inputRejected('Parameter "max_cloud_cover" must be a number between 0 and 100.', req);
    }
    body.query = { 'eo:cloud_cover': { lte: maxCloud } };
  }

  const sort = typeof p.sort === 'string' ? p.sort : 'date_desc';
  body.sortby =
    sort === 'cloud_asc'
      ? [{ field: 'properties.eo:cloud_cover', direction: 'asc' }]
      : [{ field: 'properties.datetime', direction: 'desc' }];

  return body;
}

function resolveBbox(p: Record<string, unknown>, req: ProviderRequest): number[] {
  if (Array.isArray(p.bbox)) {
    if (p.bbox.length !== 4 || p.bbox.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      throw inputRejected(
        'Parameter "bbox" must be an array of 4 numbers: [min_lon, min_lat, max_lon, max_lat].',
        req,
      );
    }
    const [minLon, minLat, maxLon, maxLat] = p.bbox as number[];
    if (minLon >= maxLon || minLat >= maxLat) {
      throw inputRejected(
        'Parameter "bbox" must have min_lon < max_lon and min_lat < max_lat.',
        req,
      );
    }
    return p.bbox as number[];
  }

  if (p.lat !== undefined && p.lon !== undefined) {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw inputRejected('Parameter "lat" must be a number between -90 and 90.', req);
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw inputRejected('Parameter "lon" must be a number between -180 and 180.', req);
    }
    const radiusKm = clampNumber(p.radius_km, 1, 500, DEFAULT_RADIUS_KM);
    const deltaDeg = radiusKm / KM_PER_DEGREE;
    return [lon - deltaDeg, lat - deltaDeg, lon + deltaDeg, lat + deltaDeg];
  }

  throw inputRejected(
    'Provide either "bbox" ([min_lon, min_lat, max_lon, max_lat]) or "lat" + "lon".',
    req,
  );
}

// ---------------------------------------------------------------------------
// Response parsers
// ---------------------------------------------------------------------------

function parseSearchScenes(body: StacSearchResponse): unknown {
  const features = Array.isArray(body?.features) ? body.features : [];
  const scenes = features.map((f) => ({
    id: f.id,
    collection: f.collection ?? null,
    datetime: f.properties?.datetime ?? null,
    cloud_cover_pct: f.properties?.['eo:cloud_cover'] ?? null,
    platform: f.properties?.platform ?? null,
    bbox: f.bbox ?? null,
    thumbnail_url: findThumbnailUrl(f),
  }));

  return {
    count: scenes.length,
    scenes,
    note: 'Use scene_detail with the "collection" and "id" of a scene for full metadata and the band/asset list.',
    source: 'Copernicus Data Space Ecosystem (ESA/EU Copernicus), public STAC catalog',
  };
}

function parseSceneDetail(item: StacItem): unknown {
  if (!item || !item.id) {
    return {
      found: false,
      note: 'Scene not found — verify the "collection" and "item_id" values, e.g. from search_scenes results.',
    };
  }

  const assetKeys = Object.keys(item.assets ?? {});
  const properties = item.properties ?? {};

  return {
    found: true,
    id: item.id,
    collection: item.collection ?? null,
    datetime: properties.datetime ?? null,
    start_datetime: properties.start_datetime ?? null,
    end_datetime: properties.end_datetime ?? null,
    bbox: item.bbox ?? null,
    platform: properties.platform ?? null,
    constellation: properties.constellation ?? null,
    instruments: properties.instruments ?? null,
    product_type: properties['product:type'] ?? null,
    cloud_cover_pct: properties['eo:cloud_cover'] ?? null,
    snow_cover_pct: properties['eo:snow_cover'] ?? null,
    orbit_state: properties['sat:orbit_state'] ?? null,
    ground_sample_distance_m: properties.gsd ?? null,
    thumbnail_url: findThumbnailUrl(item),
    assets: assetKeys,
    note:
      'Raw band pixel data (assets list above) is stored on S3/requires a free CDSE OpenID ' +
      'account to download and is out of scope of this metadata tool. thumbnail_url is a ' +
      'public quicklook JPEG requiring no authentication.',
    source: 'Copernicus Data Space Ecosystem (ESA/EU Copernicus), public STAC catalog',
  };
}

function parseListCollections(body: StacCollectionsResponse, p: Record<string, unknown>): unknown {
  const all = Array.isArray(body?.collections) ? body.collections : [];
  const keyword = typeof p.keyword === 'string' ? p.keyword.trim().toLowerCase() : '';
  const limit = clampLimit(p.limit, 100, 20);

  const filtered: StacCollectionSummary[] = keyword
    ? all.filter(
        (c) =>
          c.id.toLowerCase().includes(keyword) || (c.title ?? '').toLowerCase().includes(keyword),
      )
    : all.filter((c) => c.id.toLowerCase().includes('sentinel'));

  const collections = filtered.slice(0, limit).map((c) => ({
    id: c.id,
    title: c.title ?? null,
    license: c.license ?? null,
  }));

  return {
    count: collections.length,
    total_matched: filtered.length,
    total_available: all.length,
    collections,
    note: keyword
      ? undefined
      : 'No keyword given — showing Sentinel mission collections only. Pass a keyword (e.g. "clms", "dem", "landsat") to browse the full catalog of 400+ collections.',
    source: 'Copernicus Data Space Ecosystem (ESA/EU Copernicus), public STAC catalog',
  };
}

function findThumbnailUrl(item: StacItem): string | null {
  const assets = item.assets ?? {};
  for (const [key, asset] of Object.entries(assets)) {
    if (
      /thumbnail|quicklook|preview/i.test(key) ||
      /thumbnail|quicklook/i.test(asset.roles?.join(' ') ?? '')
    ) {
      return asset.href;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(value: unknown, field: string, req: ProviderRequest): string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw inputRejected(`Parameter "${field}" must be a date string in YYYY-MM-DD format.`, req);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string, req: ProviderRequest): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw inputRejected(`Parameter "${field}" is required and must be a non-empty string.`, req);
  }
  return value;
}

function clampLimit(value: unknown, max: number, dflt: number): number {
  return clampNumber(value, 1, max, dflt);
}

function clampNumber(value: unknown, min: number, max: number, dflt: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function inputRejected(message: string, req: ProviderRequest): never {
  throw {
    code: ProviderErrorCode.INPUT_REJECTED,
    httpStatus: 422,
    message,
    provider: 'copernicus-sentinel',
    toolId: req.toolId,
    durationMs: 0,
  };
}
