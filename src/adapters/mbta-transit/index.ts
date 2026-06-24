import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { MbtaRoute, MbtaStop, MbtaAlert, MbtaPrediction, MbtaListResponse } from './types';

const ROUTE_TYPE_LABELS: Record<number, string> = {
  0: 'Light Rail',
  1: 'Heavy Rail (Subway)',
  2: 'Commuter Rail',
  3: 'Bus',
  4: 'Ferry',
};

/**
 * MBTA V3 Transit adapter (UC-510).
 *
 * Supported tools (read-only):
 *   mbta-transit.routes      → GET /routes  (list routes by type)
 *   mbta-transit.stops       → GET /stops   (find stops by route/location)
 *   mbta-transit.alerts      → GET /alerts  (active service alerts)
 *   mbta-transit.predictions → GET /predictions (real-time departures)
 *
 * Auth: None (MassDOT Open Data License, commercial OK).
 * Rate limit: 20 req/min without API key.
 */
export class MbtaTransitAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'mbta-transit',
      baseUrl: 'https://api-v3.mbta.com',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.api+json',
    };

    switch (req.toolId) {
      case 'mbta-transit.routes':
        return this.buildRoutesRequest(params, headers);
      case 'mbta-transit.stops':
        return this.buildStopsRequest(params, headers);
      case 'mbta-transit.alerts':
        return this.buildAlertsRequest(params, headers);
      case 'mbta-transit.predictions':
        return this.buildPredictionsRequest(params, headers);
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
      case 'mbta-transit.routes':
        return this.parseRoutes(body as unknown as MbtaListResponse<MbtaRoute>);
      case 'mbta-transit.stops':
        return this.parseStops(body as unknown as MbtaListResponse<MbtaStop>);
      case 'mbta-transit.alerts':
        return this.parseAlerts(body as unknown as MbtaListResponse<MbtaAlert>);
      case 'mbta-transit.predictions':
        return this.parsePredictions(body as unknown as MbtaListResponse<MbtaPrediction>);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildRoutesRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.type !== undefined) qs.set('filter[type]', String(params.type));
    const limit = Math.min(Number(params.limit ?? 50), 100);
    qs.set('page[limit]', String(limit));
    if (params.sort) qs.set('sort', String(params.sort));
    return { url: `${this.baseUrl}/routes?${qs}`, method: 'GET', headers };
  }

  private buildStopsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.route) qs.set('filter[route]', String(params.route));
    if (params.latitude !== undefined) qs.set('filter[latitude]', String(params.latitude));
    if (params.longitude !== undefined) qs.set('filter[longitude]', String(params.longitude));
    if (params.radius !== undefined) qs.set('filter[radius]', String(params.radius));
    if (params.location_type !== undefined)
      qs.set('filter[location_type]', String(params.location_type));
    const limit = Math.min(Number(params.limit ?? 25), 100);
    qs.set('page[limit]', String(limit));
    return { url: `${this.baseUrl}/stops?${qs}`, method: 'GET', headers };
  }

  private buildAlertsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.route) qs.set('filter[route]', String(params.route));
    if (params.stop) qs.set('filter[stop]', String(params.stop));
    if (params.severity !== undefined) qs.set('filter[severity]', String(params.severity));
    if (params.lifecycle) qs.set('filter[lifecycle]', String(params.lifecycle));
    if (params.effect) qs.set('filter[effect]', String(params.effect));
    const limit = Math.min(Number(params.limit ?? 20), 50);
    qs.set('page[limit]', String(limit));
    return { url: `${this.baseUrl}/alerts?${qs}`, method: 'GET', headers };
  }

  private buildPredictionsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.stop) qs.set('filter[stop]', encodeURIComponent(String(params.stop)));
    if (params.route) qs.set('filter[route]', String(params.route));
    if (params.direction_id !== undefined)
      qs.set('filter[direction_id]', String(params.direction_id));
    const limit = Math.min(Number(params.limit ?? 10), 50);
    qs.set('page[limit]', String(limit));
    return { url: `${this.baseUrl}/predictions?${qs}`, method: 'GET', headers };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseRoutes(data: MbtaListResponse<MbtaRoute>): unknown {
    return {
      count: data.data.length,
      routes: data.data.map((r) => ({
        id: r.id,
        long_name: r.attributes.long_name,
        short_name: r.attributes.short_name || null,
        type: r.attributes.type,
        type_label: ROUTE_TYPE_LABELS[r.attributes.type] ?? 'Unknown',
        description: r.attributes.description,
        fare_class: r.attributes.fare_class,
        direction_names: r.attributes.direction_names,
        direction_destinations: r.attributes.direction_destinations,
        color: `#${r.attributes.color}`,
      })),
    };
  }

  private parseStops(data: MbtaListResponse<MbtaStop>): unknown {
    return {
      count: data.data.length,
      stops: data.data.map((s) => ({
        id: s.id,
        name: s.attributes.name,
        latitude: s.attributes.latitude,
        longitude: s.attributes.longitude,
        municipality: s.attributes.municipality,
        location_type: s.attributes.location_type,
        vehicle_type: s.attributes.vehicle_type,
        vehicle_type_label:
          s.attributes.vehicle_type !== null
            ? (ROUTE_TYPE_LABELS[s.attributes.vehicle_type] ?? 'Unknown')
            : null,
        platform_name: s.attributes.platform_name,
        wheelchair_boarding: s.attributes.wheelchair_boarding,
      })),
    };
  }

  private parseAlerts(data: MbtaListResponse<MbtaAlert>): unknown {
    return {
      count: data.data.length,
      alerts: data.data.map((a) => ({
        id: a.id,
        header: a.attributes.header,
        short_header: a.attributes.short_header || null,
        effect: a.attributes.effect,
        cause: a.attributes.cause,
        severity: a.attributes.severity,
        lifecycle: a.attributes.lifecycle,
        service_effect: a.attributes.service_effect,
        affected_routes: [
          ...new Set(
            a.attributes.informed_entity.filter((e) => e.route).map((e) => e.route as string),
          ),
        ],
        affected_stops: [
          ...new Set(
            a.attributes.informed_entity.filter((e) => e.stop).map((e) => e.stop as string),
          ),
        ],
        active_period: a.attributes.active_period.map((p) => ({
          start: p.start,
          end: p.end,
        })),
        updated_at: a.attributes.updated_at,
        url: a.attributes.url,
      })),
    };
  }

  private parsePredictions(data: MbtaListResponse<MbtaPrediction>): unknown {
    return {
      count: data.data.length,
      predictions: data.data.map((p) => ({
        id: p.id,
        arrival_time: p.attributes.arrival_time,
        departure_time: p.attributes.departure_time,
        direction_id: p.attributes.direction_id,
        status: p.attributes.status,
        schedule_relationship: p.attributes.schedule_relationship,
        stop_sequence: p.attributes.stop_sequence,
        route_id: p.relationships.route?.data?.id ?? null,
        stop_id: p.relationships.stop?.data?.id ?? null,
        trip_id: p.relationships.trip?.data?.id ?? null,
        vehicle_id: p.relationships.vehicle?.data?.id ?? null,
      })),
    };
  }
}
