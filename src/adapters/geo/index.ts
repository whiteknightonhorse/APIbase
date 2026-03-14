import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GeoapifyGeocodeResponse,
  GeoapifyPlacesResponse,
  GeoapifyRoutingResponse,
  GeoapifyIsolineResponse,
  GeoapifyIpInfoResponse,
} from './types';

/**
 * Geoapify adapter (UC-012).
 *
 * Single upstream provider for 7 geo tools:
 *   geo.geocode          -> GET /v1/geocode/search
 *   geo.reverse_geocode  -> GET /v1/geocode/reverse
 *   geo.place_search     -> GET /v2/places
 *   geo.autocomplete     -> GET /v1/geocode/autocomplete
 *   geo.routing           -> GET /v1/routing
 *   geo.isochrone         -> GET /v1/isoline
 *   geo.ip_geolocation   -> GET /v1/ipinfo
 *
 * Auth: query param ?apiKey=KEY
 * Free tier: 3,000 credits/day
 * License: ODbL (OSM) — caching/redistribution allowed
 */
export class GeoAdapter extends BaseAdapter {
  private readonly apiKey: string;

  private static readonly BASE = 'https://api.geoapify.com';

  constructor(apiKey: string) {
    super({
      provider: 'geo',
      baseUrl: GeoAdapter.BASE,
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'geo.geocode':
        return this.buildGeocode(params, headers);
      case 'geo.reverse_geocode':
        return this.buildReverseGeocode(params, headers);
      case 'geo.place_search':
        return this.buildPlaceSearch(params, headers);
      case 'geo.autocomplete':
        return this.buildAutocomplete(params, headers);
      case 'geo.routing':
        return this.buildRouting(params, headers);
      case 'geo.isochrone':
        return this.buildIsochrone(params, headers);
      case 'geo.ip_geolocation':
        return this.buildIpGeolocation(params, headers);
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
      case 'geo.geocode':
      case 'geo.reverse_geocode':
      case 'geo.autocomplete': {
        const data = body as GeoapifyGeocodeResponse;
        if (!data.features || !Array.isArray(data.features)) {
          throw new Error('Missing features in Geoapify geocode response');
        }
        return data;
      }
      case 'geo.place_search': {
        const data = body as GeoapifyPlacesResponse;
        if (!data.features || !Array.isArray(data.features)) {
          throw new Error('Missing features in Geoapify places response');
        }
        return data;
      }
      case 'geo.routing': {
        const data = body as GeoapifyRoutingResponse;
        if (!data.features || !Array.isArray(data.features)) {
          throw new Error('Missing features in Geoapify routing response');
        }
        return data;
      }
      case 'geo.isochrone': {
        const data = body as GeoapifyIsolineResponse;
        if (!data.features || !Array.isArray(data.features)) {
          throw new Error('Missing features in Geoapify isoline response');
        }
        return data;
      }
      case 'geo.ip_geolocation': {
        const data = body as GeoapifyIpInfoResponse;
        if (!data.ip) {
          throw new Error('Missing ip in Geoapify IP info response');
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // geo.geocode — Address/place geocoding
  // ---------------------------------------------------------------------------

  private buildGeocode(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('text', String(params.text));
    qs.set('apiKey', this.apiKey);
    if (params.lang) qs.set('lang', String(params.lang));
    if (params.country_code) qs.set('filter', `countrycode:${String(params.country_code).toLowerCase()}`);
    if (params.type) qs.set('type', String(params.type));
    if (params.limit) qs.set('limit', String(params.limit));

    return {
      url: `${GeoAdapter.BASE}/v1/geocode/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // geo.reverse_geocode — Coordinates to address
  // ---------------------------------------------------------------------------

  private buildReverseGeocode(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('lat', String(params.lat));
    qs.set('lon', String(params.lon));
    qs.set('apiKey', this.apiKey);
    if (params.lang) qs.set('lang', String(params.lang));

    return {
      url: `${GeoAdapter.BASE}/v1/geocode/reverse?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // geo.place_search — POI / places search (v2)
  // ---------------------------------------------------------------------------

  private buildPlaceSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('categories', String(params.categories));
    qs.set('filter', `circle:${params.lon},${params.lat},${params.radius || 1000}`);
    qs.set('apiKey', this.apiKey);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.lang) qs.set('lang', String(params.lang));

    return {
      url: `${GeoAdapter.BASE}/v2/places?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // geo.autocomplete — Address/place autocomplete
  // ---------------------------------------------------------------------------

  private buildAutocomplete(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('text', String(params.text));
    qs.set('apiKey', this.apiKey);
    if (params.lang) qs.set('lang', String(params.lang));
    if (params.country_code) qs.set('filter', `countrycode:${String(params.country_code).toLowerCase()}`);
    if (params.type) qs.set('type', String(params.type));
    if (params.limit) qs.set('limit', String(params.limit));

    return {
      url: `${GeoAdapter.BASE}/v1/geocode/autocomplete?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // geo.routing — Turn-by-turn routing
  // ---------------------------------------------------------------------------

  private buildRouting(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const mode = String(params.mode || 'drive');
    const waypoints = `${params.origin_lat},${params.origin_lon}|${params.dest_lat},${params.dest_lon}`;

    const qs = new URLSearchParams();
    qs.set('waypoints', waypoints);
    qs.set('mode', mode);
    qs.set('apiKey', this.apiKey);
    if (params.lang) qs.set('lang', String(params.lang));
    if (params.units) qs.set('units', String(params.units));

    return {
      url: `${GeoAdapter.BASE}/v1/routing?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // geo.isochrone — Reachability area (isoline)
  // ---------------------------------------------------------------------------

  private buildIsochrone(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const mode = String(params.mode || 'drive');

    const qs = new URLSearchParams();
    qs.set('lat', String(params.lat));
    qs.set('lon', String(params.lon));
    qs.set('mode', mode);
    qs.set('apiKey', this.apiKey);

    if (params.time) {
      qs.set('type', 'time');
      qs.set('range', String(params.time));
    } else if (params.distance) {
      qs.set('type', 'distance');
      qs.set('range', String(params.distance));
    } else {
      // Default: 15 min isochrone
      qs.set('type', 'time');
      qs.set('range', '900');
    }

    return {
      url: `${GeoAdapter.BASE}/v1/isoline?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // geo.ip_geolocation — IP address geolocation
  // ---------------------------------------------------------------------------

  private buildIpGeolocation(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('ip', String(params.ip));
    qs.set('apiKey', this.apiKey);

    return {
      url: `${GeoAdapter.BASE}/v1/ipinfo?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
