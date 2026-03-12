import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { AmadeusAuth } from './auth';
import type {
  AmadeusFlightSearchResponse,
  AmadeusFlightPriceResponse,
  AmadeusFlightStatusResponse,
  AmadeusLocationResponse,
  AmadeusNearestAirportResponse,
  AmadeusDirectDestinationResponse,
  AmadeusAirlineResponse,
} from './types';

/**
 * Amadeus Travel APIs adapter (UC-022).
 *
 * Supported tools (Phase 1):
 *   amadeus.flight_search    -> GET  /v2/shopping/flight-offers
 *   amadeus.flight_price     -> POST /v1/shopping/flight-offers/pricing
 *   amadeus.flight_status    -> GET  /v2/schedule/flights
 *   amadeus.airport_search   -> GET  /v1/reference-data/locations
 *   amadeus.airport_nearest  -> GET  /v1/reference-data/locations/airports
 *   amadeus.airport_routes   -> GET  /v1/airport/direct-destinations
 *   amadeus.airline_lookup   -> GET  /v1/reference-data/airlines
 *
 * Auth: OAuth2 Client Credentials (standard form POST, ~30 min token TTL).
 */
export class AmadeusAdapter extends BaseAdapter {
  private readonly auth: AmadeusAuth;
  private currentToken: string = '';

  constructor(clientId: string, clientSecret: string) {
    super({
      provider: 'amadeus',
      baseUrl: 'https://api.amadeus.com',
      timeoutMs: 10_000,
    });
    this.auth = new AmadeusAuth(clientId, clientSecret, this.baseUrl);
  }

  /**
   * Override call() to inject OAuth2 token before buildRequest() runs.
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    this.currentToken = await this.auth.getToken();
    return super.call(req);
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'amadeus.flight_search':
        return this.buildFlightSearchRequest(params);
      case 'amadeus.flight_price':
        return this.buildFlightPriceRequest(params);
      case 'amadeus.flight_status':
        return this.buildFlightStatusRequest(params);
      case 'amadeus.airport_search':
        return this.buildAirportSearchRequest(params);
      case 'amadeus.airport_nearest':
        return this.buildAirportNearestRequest(params);
      case 'amadeus.airport_routes':
        return this.buildAirportRoutesRequest(params);
      case 'amadeus.airline_lookup':
        return this.buildAirlineLookupRequest(params);
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
      case 'amadeus.flight_search': {
        const data = body as AmadeusFlightSearchResponse;
        if (!data.data) {
          throw new Error('Missing data in Amadeus flight search response');
        }
        return data;
      }
      case 'amadeus.flight_price': {
        const data = body as AmadeusFlightPriceResponse;
        if (!data.data) {
          throw new Error('Missing data in Amadeus flight price response');
        }
        return data;
      }
      case 'amadeus.flight_status': {
        const data = body as AmadeusFlightStatusResponse;
        if (!data.data) {
          throw new Error('Missing data in Amadeus flight status response');
        }
        return data;
      }
      case 'amadeus.airport_search': {
        const data = body as AmadeusLocationResponse;
        if (!data.data) {
          throw new Error('Missing data in Amadeus airport search response');
        }
        return data;
      }
      case 'amadeus.airport_nearest': {
        const data = body as AmadeusNearestAirportResponse;
        if (!data.data) {
          throw new Error('Missing data in Amadeus airport nearest response');
        }
        return data;
      }
      case 'amadeus.airport_routes': {
        const data = body as AmadeusDirectDestinationResponse;
        if (!data.data) {
          throw new Error('Missing data in Amadeus airport routes response');
        }
        return data;
      }
      case 'amadeus.airline_lookup': {
        const data = body as AmadeusAirlineResponse;
        if (!data.data) {
          throw new Error('Missing data in Amadeus airline lookup response');
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

  private buildFlightSearchRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams({
      originLocationCode: params.origin as string,
      destinationLocationCode: params.destination as string,
      departureDate: params.departure_date as string,
      adults: String((params.adults as number) || 1),
    });

    if (params.return_date) qs.set('returnDate', params.return_date as string);
    if (params.travel_class) qs.set('travelClass', params.travel_class as string);
    if (params.nonstop) qs.set('nonStop', 'true');
    if (params.max_results) qs.set('max', String(params.max_results));
    if (params.currency) qs.set('currencyCode', params.currency as string);

    return {
      url: `${this.baseUrl}/v2/shopping/flight-offers?${qs.toString()}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.currentToken}` },
    };
  }

  private buildFlightPriceRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    return {
      url: `${this.baseUrl}/v1/shopping/flight-offers/pricing`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.currentToken}`,
        'Content-Type': 'application/json',
        'X-HTTP-Method-Override': 'GET',
      },
      body: JSON.stringify({
        data: {
          type: 'flight-offers-pricing',
          flightOffers: [params.flight_offer],
        },
      }),
    };
  }

  private buildFlightStatusRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams({
      carrierCode: params.carrier_code as string,
      flightNumber: params.flight_number as string,
      scheduledDepartureDate: params.date as string,
    });

    return {
      url: `${this.baseUrl}/v2/schedule/flights?${qs.toString()}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.currentToken}` },
    };
  }

  private buildAirportSearchRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams({
      keyword: params.keyword as string,
      'page[limit]': '10',
    });

    if (params.subType) qs.set('subType', params.subType as string);

    return {
      url: `${this.baseUrl}/v1/reference-data/locations?${qs.toString()}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.currentToken}` },
    };
  }

  private buildAirportNearestRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams({
      latitude: String(params.latitude),
      longitude: String(params.longitude),
    });

    if (params.radius) qs.set('radius', String(params.radius));

    return {
      url: `${this.baseUrl}/v1/reference-data/locations/airports?${qs.toString()}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.currentToken}` },
    };
  }

  private buildAirportRoutesRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams({
      departureAirportCode: params.airport_code as string,
    });

    return {
      url: `${this.baseUrl}/v1/airport/direct-destinations?${qs.toString()}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.currentToken}` },
    };
  }

  private buildAirlineLookupRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams({
      airlineCodes: params.airline_code as string,
    });

    return {
      url: `${this.baseUrl}/v1/reference-data/airlines?${qs.toString()}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.currentToken}` },
    };
  }
}
