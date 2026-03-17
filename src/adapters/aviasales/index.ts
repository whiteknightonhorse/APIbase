import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  LatestPricesResponse,
  PriceCalendarResponse,
  CheapFlightsResponse,
  CityDirectionsResponse,
  NearbyDestinationsResponse,
} from './types';

/**
 * Aviasales / Travelpayouts adapter (UC-002).
 *
 * Supported tools (Phase 1, read-only, cached data):
 *   aviasales.search_flights       → GET /v2/prices/latest
 *   aviasales.price_calendar       → GET /v1/prices/calendar
 *   aviasales.cheap_flights        → GET /v1/prices/cheap
 *   aviasales.popular_routes       → GET /v1/city-directions
 *   aviasales.nearby_destinations  → GET /v2/prices/nearest-places-matrix
 *   aviasales.airport_lookup       → GET /data/en/airports.json (filtered client-side)
 *
 * Auth: X-Access-Token header.
 * Rate limit: 200 req/hour.
 * Data freshness: cached prices up to 48h old.
 */
export class AviasalesAdapter extends BaseAdapter {
  private readonly apiToken: string;

  constructor(apiToken: string) {
    super({
      provider: 'aviasales',
      baseUrl: 'https://api.travelpayouts.com',
    });
    this.apiToken = apiToken;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Access-Token': this.apiToken,
    };

    switch (req.toolId) {
      case 'aviasales.search_flights':
        return this.buildSearchFlights(params, headers);
      case 'aviasales.price_calendar':
        return this.buildPriceCalendar(params, headers);
      case 'aviasales.cheap_flights':
        return this.buildCheapFlights(params, headers);
      case 'aviasales.popular_routes':
        return this.buildPopularRoutes(params, headers);
      case 'aviasales.nearby_destinations':
        return this.buildNearbyDestinations(params, headers);
      case 'aviasales.airport_lookup':
        return this.buildAirportLookup(params, headers);
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'aviasales.search_flights': {
        const data = body as LatestPricesResponse;
        if (!data.success) throw new Error('Travelpayouts API returned success=false');
        return data;
      }
      case 'aviasales.price_calendar': {
        const data = body as PriceCalendarResponse;
        if (!data.success) throw new Error('Travelpayouts API returned success=false');
        return data;
      }
      case 'aviasales.cheap_flights': {
        const data = body as CheapFlightsResponse;
        if (!data.success) throw new Error('Travelpayouts API returned success=false');
        return data;
      }
      case 'aviasales.popular_routes': {
        const data = body as CityDirectionsResponse;
        if (!data.success) throw new Error('Travelpayouts API returned success=false');
        return data;
      }
      case 'aviasales.nearby_destinations': {
        const data = body as NearbyDestinationsResponse;
        if (!Array.isArray(data.prices)) throw new Error('Missing prices array in nearby response');
        return data;
      }
      case 'aviasales.airport_lookup': {
        const results = body as Array<{
          code: string;
          name: string;
          type: string;
          country_code: string;
          city_code?: string;
          coordinates?: { lat: number; lon: number };
        }>;
        if (!Array.isArray(results)) throw new Error('Expected array for airport lookup');
        return { results, total: results.length };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchFlights(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('currency', String(params.currency || 'usd'));
    qs.set('origin', String(params.origin));
    if (params.destination) qs.set('destination', String(params.destination));
    if (params.departure_date) qs.set('beginning_of_period', String(params.departure_date));
    if (params.direct_only) qs.set('direct', 'true');
    qs.set('limit', String(params.limit || 10));
    qs.set('sorting', 'price');

    return { url: `${this.baseUrl}/v2/prices/latest?${qs.toString()}`, method: 'GET', headers };
  }

  private buildPriceCalendar(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('currency', String(params.currency || 'usd'));
    qs.set('origin', String(params.origin));
    qs.set('destination', String(params.destination));
    if (params.month) qs.set('depart_date', String(params.month));

    return { url: `${this.baseUrl}/v1/prices/calendar?${qs.toString()}`, method: 'GET', headers };
  }

  private buildCheapFlights(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('currency', String(params.currency || 'usd'));
    qs.set('origin', String(params.origin));
    if (params.destination) qs.set('destination', String(params.destination));
    if (params.departure_month) qs.set('depart_date', String(params.departure_month));
    if (params.direct_only) qs.set('direct', 'true');

    return { url: `${this.baseUrl}/v1/prices/cheap?${qs.toString()}`, method: 'GET', headers };
  }

  private buildPopularRoutes(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('currency', String(params.currency || 'usd'));
    qs.set('origin', String(params.origin));

    return { url: `${this.baseUrl}/v1/city-directions?${qs.toString()}`, method: 'GET', headers };
  }

  private buildNearbyDestinations(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('currency', String(params.currency || 'usd'));
    qs.set('origin', String(params.origin));
    qs.set('destination', String(params.destination));
    if (params.depart_date) qs.set('depart_date', String(params.depart_date));
    if (params.return_date) qs.set('return_date', String(params.return_date));
    if (params.flexibility) qs.set('flexibility', String(params.flexibility));

    return {
      url: `${this.baseUrl}/v2/prices/nearest-places-matrix?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildAirportLookup(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('term', String(params.query));
    qs.set('locale', 'en');
    qs.set('types[]', 'airport');
    qs.append('types[]', 'city');

    return {
      url: `https://autocomplete.travelpayouts.com/places2?${qs.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }
}
