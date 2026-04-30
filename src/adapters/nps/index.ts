import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * US National Park Service adapter (UC-406).
 * 474 parks, 664 campgrounds, 3587 activities, 649+ active alerts.
 * Free with API key (instant signup). US Government public domain.
 * https://www.nps.gov/subjects/developer/
 */
export class NpsAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'nps',
      baseUrl: 'https://developer.nps.gov/api/v1',
      maxResponseBytes: 2_500_000,
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Api-Key': this.apiKey,
    };

    const buildQs = (extra: Record<string, string> = {}) => {
      const qs = new URLSearchParams(extra);
      if (p.state_code) qs.set('stateCode', String(p.state_code));
      if (p.park_code) qs.set('parkCode', String(p.park_code));
      if (p.q) qs.set('q', String(p.q));
      qs.set('limit', String(Math.max(1, Math.min(50, Number(p.limit ?? 10)))));
      if (p.start !== undefined) qs.set('start', String(p.start));
      return qs.toString();
    };

    switch (req.toolId) {
      case 'nps.parks':
        return { url: `${this.baseUrl}/parks?${buildQs()}`, method: 'GET', headers };
      case 'nps.alerts':
        return { url: `${this.baseUrl}/alerts?${buildQs()}`, method: 'GET', headers };
      case 'nps.campgrounds':
        return { url: `${this.baseUrl}/campgrounds?${buildQs()}`, method: 'GET', headers };
      case 'nps.things_to_do':
        return { url: `${this.baseUrl}/thingstodo?${buildQs()}`, method: 'GET', headers };
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const data = (body.data as Array<Record<string, unknown>>) ?? [];

    const base = { total: body.total, limit: body.limit, start: body.start, count: data.length };

    switch (req.toolId) {
      case 'nps.parks':
        return {
          ...base,
          parks: data.map((d) => ({
            id: d.id,
            park_code: d.parkCode,
            name: d.fullName ?? d.name,
            states: d.states,
            description:
              typeof d.description === 'string' ? d.description.slice(0, 400) : d.description,
            url: d.url,
            lat: d.latitude,
            lng: d.longitude,
            designation: d.designation,
            activities: ((d.activities as Array<Record<string, unknown>>) ?? []).map((a) => a.name),
            entrance_fees: d.entranceFees,
          })),
        };
      case 'nps.alerts':
        return {
          ...base,
          alerts: data.map((d) => ({
            id: d.id,
            park_code: d.parkCode,
            title: d.title,
            description: d.description,
            category: d.category,
            url: d.url,
            last_indexed: d.lastIndexedDate,
          })),
        };
      case 'nps.campgrounds':
        return {
          ...base,
          campgrounds: data.map((d) => ({
            id: d.id,
            name: d.name,
            park_code: d.parkCode,
            description:
              typeof d.description === 'string' ? d.description.slice(0, 400) : d.description,
            url: d.url,
            lat: d.latitude,
            lng: d.longitude,
            reservations: ((d.reservationInfo as Record<string, unknown>) ?? {}).reservationInfoUrl,
            amenities: d.amenities,
          })),
        };
      case 'nps.things_to_do':
        return {
          ...base,
          activities: data.map((d) => ({
            id: d.id,
            title: d.title,
            short_description: d.shortDescription,
            park_code: d.relatedParks
              ? ((d.relatedParks as Array<Record<string, unknown>>)[0] ?? {}).parkCode
              : undefined,
            duration: d.duration,
            difficulty: d.duration,
            url: d.url,
          })),
        };
      default:
        return raw.body;
    }
  }
}
