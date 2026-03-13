import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  TmEventsResponse,
  TmEvent,
  TmClassificationsResponse,
} from './types';

/**
 * Ticketmaster Discovery API adapter (UC-008).
 *
 * Supported tools (Phase 1, all read-only):
 *   ticketmaster.events_search     → GET /discovery/v2/events.json
 *   ticketmaster.event_details     → GET /discovery/v2/events/{id}.json
 *   ticketmaster.events_nearby     → GET /discovery/v2/events.json (latlong)
 *   ticketmaster.artist_events     → GET /discovery/v2/events.json (keyword/attractionId)
 *   ticketmaster.venue_events      → GET /discovery/v2/events.json (venueId)
 *   ticketmaster.events_trending   → GET /discovery/v2/events.json (sort=relevance,desc)
 *   ticketmaster.events_categories → GET /discovery/v2/classifications.json
 *
 * Auth: ?apikey=KEY (query parameter, NOT header).
 * Rate limit: 5,000 req/day, 2 req/sec.
 */
export class TicketmasterAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'ticketmaster',
      baseUrl: 'https://app.ticketmaster.com',
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
      case 'ticketmaster.events_search':
        return this.buildEventsSearchRequest(params, headers);
      case 'ticketmaster.event_details':
        return this.buildEventDetailsRequest(params, headers);
      case 'ticketmaster.events_nearby':
        return this.buildEventsNearbyRequest(params, headers);
      case 'ticketmaster.artist_events':
        return this.buildArtistEventsRequest(params, headers);
      case 'ticketmaster.venue_events':
        return this.buildVenueEventsRequest(params, headers);
      case 'ticketmaster.events_trending':
        return this.buildEventsTrendingRequest(params, headers);
      case 'ticketmaster.events_categories':
        return this.buildCategoriesRequest(params, headers);
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
      case 'ticketmaster.events_search':
      case 'ticketmaster.events_nearby':
      case 'ticketmaster.artist_events':
      case 'ticketmaster.venue_events':
      case 'ticketmaster.events_trending': {
        const data = body as TmEventsResponse;
        if (!data.page) {
          throw new Error('Missing page metadata in events response');
        }
        return data;
      }
      case 'ticketmaster.event_details': {
        const data = body as TmEvent;
        if (!data.id || !data.name) {
          throw new Error('Missing required fields in event details response');
        }
        return data;
      }
      case 'ticketmaster.events_categories': {
        const data = body as TmClassificationsResponse;
        if (!data.page) {
          throw new Error('Missing page metadata in classifications response');
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildEventsSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apikey', this.apiKey);

    if (params.keyword) qs.set('keyword', String(params.keyword));
    if (params.city) qs.set('city', String(params.city));
    if (params.countryCode) qs.set('countryCode', String(params.countryCode));
    if (params.stateCode) qs.set('stateCode', String(params.stateCode));
    if (params.classificationName) qs.set('classificationName', String(params.classificationName));
    if (params.startDateTime) qs.set('startDateTime', String(params.startDateTime));
    if (params.endDateTime) qs.set('endDateTime', String(params.endDateTime));
    if (params.size) qs.set('size', String(params.size));
    if (params.page) qs.set('page', String(params.page));
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.locale) qs.set('locale', String(params.locale));

    return {
      url: `${this.baseUrl}/discovery/v2/events.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildEventDetailsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const eventId = String(params.id);
    const qs = new URLSearchParams();
    qs.set('apikey', this.apiKey);

    if (params.locale) qs.set('locale', String(params.locale));

    return {
      url: `${this.baseUrl}/discovery/v2/events/${encodeURIComponent(eventId)}.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildEventsNearbyRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apikey', this.apiKey);

    if (params.latlong) qs.set('latlong', String(params.latlong));
    if (params.radius) qs.set('radius', String(params.radius));
    if (params.unit) qs.set('unit', String(params.unit));
    if (params.keyword) qs.set('keyword', String(params.keyword));
    if (params.classificationName) qs.set('classificationName', String(params.classificationName));
    if (params.startDateTime) qs.set('startDateTime', String(params.startDateTime));
    if (params.endDateTime) qs.set('endDateTime', String(params.endDateTime));
    if (params.size) qs.set('size', String(params.size));
    if (params.page) qs.set('page', String(params.page));
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.locale) qs.set('locale', String(params.locale));

    return {
      url: `${this.baseUrl}/discovery/v2/events.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildArtistEventsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apikey', this.apiKey);

    if (params.keyword) qs.set('keyword', String(params.keyword));
    if (params.attractionId) qs.set('attractionId', String(params.attractionId));
    if (params.countryCode) qs.set('countryCode', String(params.countryCode));
    if (params.startDateTime) qs.set('startDateTime', String(params.startDateTime));
    if (params.endDateTime) qs.set('endDateTime', String(params.endDateTime));
    if (params.size) qs.set('size', String(params.size));
    if (params.page) qs.set('page', String(params.page));
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.locale) qs.set('locale', String(params.locale));

    return {
      url: `${this.baseUrl}/discovery/v2/events.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildVenueEventsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apikey', this.apiKey);

    if (params.venueId) qs.set('venueId', String(params.venueId));
    if (params.keyword) qs.set('keyword', String(params.keyword));
    if (params.startDateTime) qs.set('startDateTime', String(params.startDateTime));
    if (params.endDateTime) qs.set('endDateTime', String(params.endDateTime));
    if (params.size) qs.set('size', String(params.size));
    if (params.page) qs.set('page', String(params.page));
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.locale) qs.set('locale', String(params.locale));

    return {
      url: `${this.baseUrl}/discovery/v2/events.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildEventsTrendingRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apikey', this.apiKey);
    qs.set('sort', 'relevance,desc');

    if (params.countryCode) qs.set('countryCode', String(params.countryCode));
    if (params.classificationName) qs.set('classificationName', String(params.classificationName));
    if (params.size) qs.set('size', String(params.size));
    if (params.page) qs.set('page', String(params.page));
    if (params.locale) qs.set('locale', String(params.locale));

    return {
      url: `${this.baseUrl}/discovery/v2/events.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildCategoriesRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apikey', this.apiKey);

    if (params.size) qs.set('size', String(params.size));
    if (params.page) qs.set('page', String(params.page));
    if (params.locale) qs.set('locale', String(params.locale));

    return {
      url: `${this.baseUrl}/discovery/v2/classifications.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
