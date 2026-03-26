import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { GdacsFeatureCollection, GdacsFeature } from './types';

/**
 * GDACS (UN Global Disaster Alert and Coordination System) adapter (UC-194).
 *
 * Supported tools:
 *   gdacs.alerts  → GET /events/geteventlist/SEARCH
 *   gdacs.events  → GET /events/geteventlist/SEARCH (filtered by eventid)
 *   gdacs.history → GET /events/geteventlist/ARCHIVE
 *
 * Auth: None (UN/EC open data). Returns GeoJSON FeatureCollection.
 */
export class GdacsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'gdacs',
      baseUrl: 'https://www.gdacs.org/gdacsapi/api',
      timeoutMs: 15000,
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
      case 'gdacs.alerts':
        return this.buildAlertsRequest(params, headers);
      case 'gdacs.events':
        return this.buildEventRequest(params, headers);
      case 'gdacs.history':
        return this.buildHistoryRequest(params, headers);
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
    const body = raw.body as GdacsFeatureCollection;
    const features = body.features ?? [];

    switch (req.toolId) {
      case 'gdacs.alerts':
      case 'gdacs.history':
        return {
          total: features.length,
          events: features.map((f) => this.formatEvent(f)),
        };

      case 'gdacs.events': {
        if (features.length === 0) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 404,
            message: 'Event not found',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return this.formatEventDetail(features[0]);
      }

      default:
        return body;
    }
  }

  private formatEvent(f: GdacsFeature): Record<string, unknown> {
    const p = f.properties;
    return {
      event_id: p.eventid,
      event_type: p.eventtype,
      name: p.name,
      alert_level: p.alertlevel,
      alert_score: p.alertscore,
      country: p.country,
      description: p.description,
      from_date: p.fromdate,
      to_date: p.todate,
      coordinates: f.geometry?.coordinates,
      severity: p.severity,
      population: p.population,
    };
  }

  private formatEventDetail(f: GdacsFeature): Record<string, unknown> {
    const p = f.properties;
    return {
      event_id: p.eventid,
      episode_id: p.episodeid,
      event_type: p.eventtype,
      name: p.name,
      glide: p.glide,
      alert_level: p.alertlevel,
      alert_score: p.alertscore,
      country: p.country,
      description: p.description,
      html_description: p.htmldescription,
      from_date: p.fromdate,
      to_date: p.todate,
      date_modified: p.datemodified,
      coordinates: f.geometry?.coordinates,
      bbox: f.bbox,
      severity: p.severity,
      population: p.population,
      vulnerability: p.vulnerability,
      url: p.url,
      icon: p.icon,
    };
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildAlertsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.event_type) qs.set('eventlist', String(params.event_type));
    if (params.alert_level) qs.set('alertlevel', String(params.alert_level));
    qs.set('limit', String(params.limit ?? 10));

    return { url: `${this.baseUrl}/events/geteventlist/SEARCH?${qs.toString()}`, method: 'GET', headers };
  }

  private buildEventRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const eventId = String(params.event_id);
    const eventType = String(params.event_type || 'EQ');
    const qs = new URLSearchParams();
    qs.set('eventlist', eventType);
    qs.set('eventid', eventId);
    qs.set('limit', '1');

    return { url: `${this.baseUrl}/events/geteventlist/SEARCH?${qs.toString()}`, method: 'GET', headers };
  }

  private buildHistoryRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.date_from) qs.set('fromDate', String(params.date_from));
    if (params.date_to) qs.set('toDate', String(params.date_to));
    if (params.event_type) qs.set('eventlist', String(params.event_type));
    if (params.alert_level) qs.set('alertlevel', String(params.alert_level));
    if (params.country) qs.set('country', String(params.country));
    qs.set('limit', String(params.limit ?? 10));

    return { url: `${this.baseUrl}/events/geteventlist/ARCHIVE?${qs.toString()}`, method: 'GET', headers };
  }
}
