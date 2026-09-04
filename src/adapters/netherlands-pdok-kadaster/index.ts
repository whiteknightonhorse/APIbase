import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  PdokFeatureCollection,
  PdokPerceelProperties,
  PdokBebouwingProperties,
} from './types';

const PDOK_BASE = 'https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1';
const KM_PER_DEGREE = 111; // approximation, adequate for a search-radius bbox
// Full onshore Netherlands coverage extent (Kadaster's BRK covers the whole country).
const NL_BBOX: [number, number, number, number] = [3.2, 50.6, 7.3, 53.7];

const PERCEEL_COLLECTION = 'perceel';
const BEBOUWING_COLLECTION = 'bebouwing';

const HEADERS = { Accept: 'application/json' };

/**
 * PDOK Kadaster Kadastrale Kaart OGC API Features adapter (UC-680).
 *
 * api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1 is a no-auth, public OGC API Features
 * server publishing the Dutch cadastral map (Basisregistratie Kadaster / BRK) — parcel
 * boundaries and building outlines for the whole of the Netherlands — under PDOK's open
 * data terms (Kadaster open data, no licence restrictions, free reuse incl. commercial).
 *
 * Tools:
 *   netherlands-pdok-kadaster.search_percelen  -> cadastral parcels (perceel) near a point/bbox
 *   netherlands-pdok-kadaster.get_perceel       -> single cadastral parcel by feature id
 *   netherlands-pdok-kadaster.search_bebouwing  -> building outlines (bebouwing) near a point/bbox
 *
 * Response-size discipline (measured live): the upstream rejects `skipGeometry` and
 * `properties` (400 "unknown query parameter(s)") — every feature always carries its full
 * MultiPolygon geometry. Measured ~1-1.8KB/feature for typical urban parcels/buildings, so
 * `limit` is capped well below the upstream's own max (1000) to keep responses small and
 * predictable: 30 for search tools.
 */
export class NetherlandsPdokKadasterAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'netherlands-pdok-kadaster',
      baseUrl: PDOK_BASE,
      maxResponseBytes: 1_500_000,
    });
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

  private resolveBbox(
    toolId: string,
    params: Record<string, unknown>,
    defaultRadiusKm: number,
    maxRadiusKm: number,
  ): [number, number, number, number] {
    const lat = params.lat;
    const lng = params.lng;
    if (lat === undefined && lng === undefined) return NL_BBOX;
    if (
      lat === undefined ||
      lng === undefined ||
      typeof lat !== 'number' ||
      typeof lng !== 'number'
    ) {
      throw this.invalidInput(toolId, 'lat and lng must be supplied together as numbers');
    }
    if (lat < -90 || lat > 90) {
      throw this.invalidInput(toolId, 'lat must be between -90 and 90');
    }
    if (lng < -180 || lng > 180) {
      throw this.invalidInput(toolId, 'lng must be between -180 and 180');
    }
    const radiusKmRaw = params.radius_km;
    const radiusKm =
      typeof radiusKmRaw === 'number'
        ? Math.min(Math.max(radiusKmRaw, 0.1), maxRadiusKm)
        : defaultRadiusKm;
    const latDelta = radiusKm / KM_PER_DEGREE;
    const lngDelta = radiusKm / (KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
    return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta];
  }

  private clampLimit(value: unknown, max: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(Math.max(Math.round(value), 1), max);
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'netherlands-pdok-kadaster.search_percelen': {
        const bbox = this.resolveBbox(req.toolId, params, 1, 20);
        const limit = this.clampLimit(params.limit, 30, 10);
        const qs = new URLSearchParams({ bbox: bbox.join(','), limit: String(limit), f: 'json' });
        return {
          url: `${PDOK_BASE}/collections/${PERCEEL_COLLECTION}/items?${qs.toString()}`,
          method: 'GET',
          headers: HEADERS,
        };
      }

      case 'netherlands-pdok-kadaster.get_perceel': {
        const id = params.id;
        if (typeof id !== 'string' || id.trim() === '') {
          throw this.invalidInput(req.toolId, 'id is required and must be a non-empty string');
        }
        const qs = new URLSearchParams({ f: 'json' });
        return {
          url: `${PDOK_BASE}/collections/${PERCEEL_COLLECTION}/items/${encodeURIComponent(id)}?${qs.toString()}`,
          method: 'GET',
          headers: HEADERS,
        };
      }

      case 'netherlands-pdok-kadaster.search_bebouwing': {
        const bbox = this.resolveBbox(req.toolId, params, 1, 20);
        const limit = this.clampLimit(params.limit, 30, 10);
        const qs = new URLSearchParams({ bbox: bbox.join(','), limit: String(limit), f: 'json' });
        return {
          url: `${PDOK_BASE}/collections/${BEBOUWING_COLLECTION}/items?${qs.toString()}`,
          method: 'GET',
          headers: HEADERS,
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

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'netherlands-pdok-kadaster.search_percelen': {
        const body = raw.body as PdokFeatureCollection<PdokPerceelProperties>;
        const features = body.features ?? [];
        return {
          matched: body.numberMatched ?? features.length,
          returned: features.length,
          percelen: features.map((f) => ({
            id: f.id,
            ...f.properties,
            geometry: f.geometry ?? null,
          })),
        };
      }

      case 'netherlands-pdok-kadaster.get_perceel': {
        const body = raw.body as { id?: string; properties: PdokPerceelProperties } & {
          geometry?: unknown;
        };
        return {
          id: body.id,
          ...body.properties,
          geometry: body.geometry ?? null,
        };
      }

      case 'netherlands-pdok-kadaster.search_bebouwing': {
        const body = raw.body as PdokFeatureCollection<PdokBebouwingProperties>;
        const features = body.features ?? [];
        return {
          matched: body.numberMatched ?? features.length,
          returned: features.length,
          buildings: features.map((f) => ({
            id: f.id,
            ...f.properties,
            geometry: f.geometry ?? null,
          })),
        };
      }

      default:
        return raw.body;
    }
  }
}
