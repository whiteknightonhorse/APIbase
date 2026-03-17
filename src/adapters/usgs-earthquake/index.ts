import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { EarthquakeResponse, EarthquakeCountResponse } from './types';

/**
 * USGS Earthquake Hazards Program adapter (UC-048).
 *
 * Supported tools (read-only):
 *   earthquake.search → GET /fdsnws/event/1/query?format=geojson
 *   earthquake.feed   → GET /earthquakes/feed/v1.0/summary/{mag}_{time}.geojson
 *   earthquake.count  → GET /fdsnws/event/1/count?format=geojson
 *
 * Auth: None (US Government open data, public domain).
 */
export class UsgsEarthquakeAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'usgs-earthquake',
      baseUrl: 'https://earthquake.usgs.gov',
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
    };

    switch (req.toolId) {
      case 'earthquake.search':
        return this.buildSearchRequest(params, headers);
      case 'earthquake.feed':
        return this.buildFeedRequest(params, headers);
      case 'earthquake.count':
        return this.buildCountRequest(params, headers);
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
      case 'earthquake.search':
      case 'earthquake.feed': {
        const data = body as unknown as EarthquakeResponse;
        return {
          title: data.metadata?.title,
          count: data.features?.length ?? 0,
          earthquakes: (data.features ?? []).map(f => ({
            id: f.id,
            magnitude: f.properties.mag,
            mag_type: f.properties.magType,
            place: f.properties.place,
            time: new Date(f.properties.time).toISOString(),
            latitude: f.geometry.coordinates[1],
            longitude: f.geometry.coordinates[0],
            depth_km: f.geometry.coordinates[2],
            tsunami: f.properties.tsunami === 1,
            alert: f.properties.alert,
            felt: f.properties.felt,
            significance: f.properties.sig,
            status: f.properties.status,
            url: f.properties.url,
          })),
        };
      }
      case 'earthquake.count': {
        const data = body as unknown as EarthquakeCountResponse;
        return {
          count: data.count,
          max_allowed: data.maxAllowed,
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('format', 'geojson');
    if (params.starttime) qs.set('starttime', String(params.starttime));
    if (params.endtime) qs.set('endtime', String(params.endtime));
    if (params.minmagnitude !== undefined) qs.set('minmagnitude', String(params.minmagnitude));
    if (params.maxmagnitude !== undefined) qs.set('maxmagnitude', String(params.maxmagnitude));
    if (params.latitude !== undefined) qs.set('latitude', String(params.latitude));
    if (params.longitude !== undefined) qs.set('longitude', String(params.longitude));
    if (params.maxradiuskm !== undefined) qs.set('maxradiuskm', String(params.maxradiuskm));
    if (params.mindepth !== undefined) qs.set('mindepth', String(params.mindepth));
    if (params.maxdepth !== undefined) qs.set('maxdepth', String(params.maxdepth));
    if (params.orderby) qs.set('orderby', String(params.orderby));
    if (params.limit) qs.set('limit', String(params.limit));
    else qs.set('limit', '20');
    if (params.alertlevel) qs.set('alertlevel', String(params.alertlevel));

    return {
      url: `${this.baseUrl}/fdsnws/event/1/query?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildFeedRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const magnitude = String(params.magnitude ?? '4.5');
    const timeframe = String(params.timeframe ?? 'day');

    return {
      url: `${this.baseUrl}/earthquakes/feed/v1.0/summary/${magnitude}_${timeframe}.geojson`,
      method: 'GET',
      headers,
    };
  }

  private buildCountRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('format', 'geojson');
    if (params.starttime) qs.set('starttime', String(params.starttime));
    if (params.endtime) qs.set('endtime', String(params.endtime));
    if (params.minmagnitude !== undefined) qs.set('minmagnitude', String(params.minmagnitude));
    if (params.maxmagnitude !== undefined) qs.set('maxmagnitude', String(params.maxmagnitude));
    if (params.latitude !== undefined) qs.set('latitude', String(params.latitude));
    if (params.longitude !== undefined) qs.set('longitude', String(params.longitude));
    if (params.maxradiuskm !== undefined) qs.set('maxradiuskm', String(params.maxradiuskm));

    return {
      url: `${this.baseUrl}/fdsnws/event/1/count?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
