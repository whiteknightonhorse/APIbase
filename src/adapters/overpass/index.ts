import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { OverpassElement, OverpassResponse } from './types';

/**
 * Overpass API adapter (UC-460).
 *
 * Supported tools (read-only, no auth required):
 *   overpass.amenities       → POST /api/interpreter  (amenities by type in bbox)
 *   overpass.pois_nearby     → POST /api/interpreter  (POIs around a lat/lon point)
 *   overpass.named_place     → POST /api/interpreter  (named places/streets by name)
 *   overpass.public_transport → POST /api/interpreter (transit stops in bbox)
 *
 * Auth: None (OpenStreetMap open data, ODbL license).
 * Rate limit: 2 concurrent queries (public endpoint).
 */
export class OverpassAdapter extends BaseAdapter {
  private static readonly BASE = 'https://overpass-api.de';

  constructor() {
    super({
      provider: 'overpass',
      baseUrl: OverpassAdapter.BASE,
      timeoutMs: 20_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
      Accept: 'application/json',
    };

    let query: string;
    switch (req.toolId) {
      case 'overpass.amenities':
        query = this.buildAmenitiesQuery(params);
        break;
      case 'overpass.pois_nearby':
        query = this.buildPoisNearbyQuery(params);
        break;
      case 'overpass.named_place':
        query = this.buildNamedPlaceQuery(params);
        break;
      case 'overpass.public_transport':
        query = this.buildPublicTransportQuery(params);
        break;
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

    const body = new URLSearchParams({ data: query }).toString();
    return {
      url: `${OverpassAdapter.BASE}/api/interpreter`,
      method: 'POST',
      headers,
      body,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as OverpassResponse;

    switch (req.toolId) {
      case 'overpass.amenities':
      case 'overpass.pois_nearby':
        return this.parseAmenityElements(body.elements);
      case 'overpass.named_place':
        return this.parseNamedPlaceElements(body.elements);
      case 'overpass.public_transport':
        return this.parseTransitElements(body.elements);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Query builders
  // ---------------------------------------------------------------------------

  private buildAmenitiesQuery(params: Record<string, unknown>): string {
    const latMin = Number(params.lat_min);
    const lonMin = Number(params.lon_min);
    const latMax = Number(params.lat_max);
    const lonMax = Number(params.lon_max);
    const limit = Math.min(Number(params.limit ?? 20), 50);
    const amenityType = String(params.amenity_type);
    const bbox = `${latMin},${lonMin},${latMax},${lonMax}`;
    return `[out:json][timeout:15];node["amenity"="${amenityType}"](${bbox});out ${limit};`;
  }

  private buildPoisNearbyQuery(params: Record<string, unknown>): string {
    const lat = Number(params.lat);
    const lon = Number(params.lon);
    const radius = Math.min(Number(params.radius_m ?? 500), 5000);
    const limit = Math.min(Number(params.limit ?? 20), 50);
    const amenityType = params.amenity_type ? String(params.amenity_type) : null;
    const around = `around:${radius},${lat},${lon}`;
    if (amenityType) {
      return `[out:json][timeout:15];node["amenity"="${amenityType}"](${around});out ${limit};`;
    }
    // When no type — search common OSM features (amenity OR tourism OR shop)
    return `[out:json][timeout:15];(node["amenity"](${around});node["tourism"](${around});node["shop"](${around}););out ${limit};`;
  }

  private buildNamedPlaceQuery(params: Record<string, unknown>): string {
    const name = String(params.name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const limit = Math.min(Number(params.limit ?? 10), 30);
    const timeout = 20;
    const featureType = String(params.feature_type ?? 'all');

    let bboxClause = '';
    if (
      params.lat_min !== undefined &&
      params.lon_min !== undefined &&
      params.lat_max !== undefined &&
      params.lon_max !== undefined
    ) {
      bboxClause = `(${Number(params.lat_min)},${Number(params.lon_min)},${Number(params.lat_max)},${Number(params.lon_max)})`;
    }

    if (featureType === 'node') {
      return `[out:json][timeout:${timeout}];node["name"~"${name}",i]${bboxClause};out center ${limit};`;
    }
    if (featureType === 'way') {
      return `[out:json][timeout:${timeout}];way["name"~"${name}",i]${bboxClause};out center ${limit};`;
    }
    if (featureType === 'relation') {
      return `[out:json][timeout:${timeout}];relation["name"~"${name}",i]${bboxClause};out center ${limit};`;
    }
    // Default: all types
    return `[out:json][timeout:${timeout}];(nwr["name"~"${name}",i]${bboxClause};);out center ${limit};`;
  }

  private buildPublicTransportQuery(params: Record<string, unknown>): string {
    const latMin = Number(params.lat_min);
    const lonMin = Number(params.lon_min);
    const latMax = Number(params.lat_max);
    const lonMax = Number(params.lon_max);
    const limit = Math.min(Number(params.limit ?? 20), 50);
    const bbox = `${latMin},${lonMin},${latMax},${lonMax}`;
    const transportType = String(params.transport_type ?? 'all');

    switch (transportType) {
      case 'bus':
        return `[out:json][timeout:15];node["highway"="bus_stop"](${bbox});out ${limit};`;
      case 'train':
        return `[out:json][timeout:15];node["railway"~"station|halt"](${bbox});out ${limit};`;
      case 'subway':
        return `[out:json][timeout:15];node["station"="subway"](${bbox});out ${limit};`;
      case 'tram':
        return `[out:json][timeout:15];node["railway"="tram_stop"](${bbox});out ${limit};`;
      case 'ferry':
        return `[out:json][timeout:15];node["amenity"="ferry_terminal"](${bbox});out ${limit};`;
      default:
        // All transit: bus stops + train stations + tram stops
        return `[out:json][timeout:15];(node["highway"="bus_stop"](${bbox});node["railway"~"station|halt|tram_stop"](${bbox});node["station"="subway"](${bbox}););out ${limit};`;
    }
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private normalizeLat(el: OverpassElement): number | undefined {
    return el.lat ?? el.center?.lat;
  }

  private normalizeLon(el: OverpassElement): number | undefined {
    return el.lon ?? el.center?.lon;
  }

  private parseAmenityElements(elements: OverpassElement[]): unknown {
    return {
      count: elements.length,
      places: elements.map((el) => ({
        id: el.id,
        osm_type: el.type,
        name: el.tags?.name ?? null,
        amenity: el.tags?.amenity ?? null,
        lat: this.normalizeLat(el) ?? null,
        lon: this.normalizeLon(el) ?? null,
        address: this.extractAddress(el.tags),
        phone: el.tags?.phone ?? el.tags?.['contact:phone'] ?? null,
        website: el.tags?.website ?? el.tags?.['contact:website'] ?? null,
        opening_hours: el.tags?.opening_hours ?? null,
        tags: el.tags ?? {},
      })),
    };
  }

  private parseNamedPlaceElements(elements: OverpassElement[]): unknown {
    return {
      count: elements.length,
      places: elements.map((el) => ({
        id: el.id,
        osm_type: el.type,
        name: el.tags?.name ?? null,
        place_type:
          el.tags?.place ??
          el.tags?.leisure ??
          el.tags?.natural ??
          el.tags?.highway ??
          el.tags?.amenity ??
          null,
        lat: this.normalizeLat(el) ?? null,
        lon: this.normalizeLon(el) ?? null,
        country: el.tags?.['addr:country'] ?? null,
        city: el.tags?.['addr:city'] ?? null,
        tags: el.tags ?? {},
      })),
    };
  }

  private parseTransitElements(elements: OverpassElement[]): unknown {
    return {
      count: elements.length,
      stops: elements.map((el) => ({
        id: el.id,
        osm_type: el.type,
        name: el.tags?.name ?? null,
        transport_type: this.detectTransportType(el.tags),
        lat: this.normalizeLat(el) ?? null,
        lon: this.normalizeLon(el) ?? null,
        network: el.tags?.network ?? null,
        operator: el.tags?.operator ?? null,
        ref: el.tags?.ref ?? null,
        wheelchair: el.tags?.wheelchair ?? null,
        tags: el.tags ?? {},
      })),
    };
  }

  private detectTransportType(tags?: Record<string, string>): string {
    if (!tags) return 'unknown';
    if (tags.highway === 'bus_stop') return 'bus';
    if (tags.railway === 'tram_stop') return 'tram';
    if (tags.station === 'subway') return 'subway';
    if (tags.railway === 'station' || tags.railway === 'halt') return 'train';
    if (tags.amenity === 'ferry_terminal') return 'ferry';
    return tags.public_transport ?? 'transit';
  }

  private extractAddress(tags?: Record<string, string>): Record<string, string | undefined> | null {
    if (!tags) return null;
    const addr = {
      street: tags['addr:street'],
      housenumber: tags['addr:housenumber'],
      postcode: tags['addr:postcode'],
      city: tags['addr:city'],
      country: tags['addr:country'],
    };
    if (Object.values(addr).every((v) => v === undefined)) return null;
    return addr;
  }
}
