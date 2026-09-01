import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BgsFeatureCollection,
  BgsBedrockProperties,
  BgsEarthquakeProperties,
  BgsBoreholeProperties,
  BgsLandslideProperties,
} from './types';

const BGS_BASE = 'https://ogcapi.bgs.ac.uk';
const KM_PER_DEGREE = 111; // approximation, adequate for a search-radius bbox
// Full onshore Great Britain coverage extent (matches every collection's advertised extent).
const GB_BBOX: [number, number, number, number] = [-9, 49.5, 3, 61];

const BEDROCK_COLLECTION = 'bgsgeology625kbedrock';
const BEDROCK_PROPERTIES =
  'lex,lex_d,rcs,rcs_d,rank,max_time_d,min_time_d,max_time_y,min_time_y,bgstype,sheet,released';
const EARTHQUAKE_COLLECTIONS = { modern: 'recentearthquakes', historical: 'historicalearthquakes' };
const BOREHOLE_COLLECTION = 'onshoreboreholeindex';
const LANDSLIDE_COLLECTION = 'landslideindex';

const HEADERS = { Accept: 'application/json' };

/**
 * British Geological Survey OGC API Features adapter (UC-650).
 *
 * ogcapi.bgs.ac.uk is a no-auth, public OGC API Features server (pygeoapi) run by the British
 * Geological Survey, publishing open geospatial datasets under the Open Government Licence.
 *
 * Tools:
 *   bgs-ogcapi.geology_bedrock   -> bedrock geology units near a point (lithology + age)
 *   bgs-ogcapi.earthquake_search -> UK earthquakes (modern instrument-recorded or pre-1970 historical)
 *   bgs-ogcapi.borehole_search   -> Single Onshore Borehole Index (SOBI) records near a point
 *   bgs-ogcapi.landslide_search  -> National Landslide Database records near a point
 *
 * Response-size discipline (measured live): `bgsgeology625kbedrock/items` with a tight bbox but
 * geometry included returns a single feature at 1.3MB+ (full unclipped polygon boundary) — every
 * bedrock query therefore uses `skipGeometry=true` plus a curated `properties=` list (measured
 * ~67KB for 100 features). The other three collections carry small Point geometries and are left
 * un-clipped. All bbox queries default to the caller's lat/lng + radius_km, or the full GB extent
 * (-9,49.5,3,61 — matches every collection's advertised spatial extent) when lat/lng is omitted.
 */
export class BgsOgcApiAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'bgs-ogcapi', baseUrl: BGS_BASE, maxResponseBytes: 1_500_000 });
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
    if (lat === undefined && lng === undefined) return GB_BBOX;
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
        ? Math.min(Math.max(radiusKmRaw, 0.5), maxRadiusKm)
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
      case 'bgs-ogcapi.geology_bedrock': {
        const bbox = this.resolveBbox(req.toolId, params, 5, 50);
        const limit = this.clampLimit(params.limit, 50, 20);
        const qs = new URLSearchParams({
          bbox: bbox.join(','),
          limit: String(limit),
          f: 'json',
          skipGeometry: 'true',
          properties: BEDROCK_PROPERTIES,
        });
        return {
          url: `${BGS_BASE}/collections/${BEDROCK_COLLECTION}/items?${qs.toString()}`,
          method: 'GET',
          headers: HEADERS,
        };
      }

      case 'bgs-ogcapi.earthquake_search': {
        const period = params.period === 'historical' ? 'historical' : 'modern';
        const collection = EARTHQUAKE_COLLECTIONS[period];
        const bbox = this.resolveBbox(req.toolId, params, 50, 500);
        const wantsMagnitudeFilter = typeof params.min_magnitude === 'number';
        const limit = this.clampLimit(params.limit, 100, 20);
        const fetchLimit = wantsMagnitudeFilter ? Math.min(limit * 5, 500) : limit;
        const qs = new URLSearchParams({
          bbox: bbox.join(','),
          limit: String(fetchLimit),
          f: 'json',
        });
        const year = params.year;
        if (typeof year === 'string' && /^\d{4}$/.test(year)) {
          qs.set('year', year);
        }
        return {
          url: `${BGS_BASE}/collections/${collection}/items?${qs.toString()}`,
          method: 'GET',
          headers: HEADERS,
        };
      }

      case 'bgs-ogcapi.borehole_search': {
        const bbox = this.resolveBbox(req.toolId, params, 5, 50);
        const limit = this.clampLimit(params.limit, 100, 20);
        const qs = new URLSearchParams({ bbox: bbox.join(','), limit: String(limit), f: 'json' });
        return {
          url: `${BGS_BASE}/collections/${BOREHOLE_COLLECTION}/items?${qs.toString()}`,
          method: 'GET',
          headers: HEADERS,
        };
      }

      case 'bgs-ogcapi.landslide_search': {
        const bbox = this.resolveBbox(req.toolId, params, 20, 200);
        const limit = this.clampLimit(params.limit, 100, 20);
        const qs = new URLSearchParams({ bbox: bbox.join(','), limit: String(limit), f: 'json' });
        return {
          url: `${BGS_BASE}/collections/${LANDSLIDE_COLLECTION}/items?${qs.toString()}`,
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
      case 'bgs-ogcapi.geology_bedrock': {
        const body = raw.body as BgsFeatureCollection<BgsBedrockProperties>;
        const features = body.features ?? [];
        return {
          matched: body.numberMatched ?? features.length,
          returned: features.length,
          units: features.map((f) => f.properties),
        };
      }

      case 'bgs-ogcapi.earthquake_search': {
        const body = raw.body as BgsFeatureCollection<BgsEarthquakeProperties>;
        const params = (req.params ?? {}) as Record<string, unknown>;
        const minMagnitude = params.min_magnitude;
        const limit = this.clampLimit(params.limit, 100, 20);
        let events = (body.features ?? []).map((f) => f.properties);
        if (typeof minMagnitude === 'number') {
          events = events.filter((e) => typeof e.ml === 'number' && e.ml >= minMagnitude);
        }
        events = events.slice(0, limit);
        return {
          period: params.period === 'historical' ? 'historical' : 'modern',
          matched: body.numberMatched ?? events.length,
          returned: events.length,
          earthquakes: events,
        };
      }

      case 'bgs-ogcapi.borehole_search': {
        const body = raw.body as BgsFeatureCollection<BgsBoreholeProperties>;
        const features = body.features ?? [];
        return {
          matched: body.numberMatched ?? features.length,
          returned: features.length,
          boreholes: features.map((f) => ({
            ...f.properties,
            longitude: f.geometry?.coordinates?.[0] ?? null,
            latitude: f.geometry?.coordinates?.[1] ?? null,
          })),
        };
      }

      case 'bgs-ogcapi.landslide_search': {
        const body = raw.body as BgsFeatureCollection<BgsLandslideProperties>;
        const features = body.features ?? [];
        return {
          matched: body.numberMatched ?? features.length,
          returned: features.length,
          landslides: features.map((f) => ({
            ...f.properties,
            longitude: f.geometry?.coordinates?.[0] ?? null,
            latitude: f.geometry?.coordinates?.[1] ?? null,
          })),
        };
      }

      default:
        return raw.body;
    }
  }
}
