import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { SabreAuth } from './auth';
import type {
  SabreInstaFlightsResponse,
  SabreDestinationFinderResponse,
  SabreAirlineResponse,
  SabreThemesResponse,
} from './types';

/**
 * Sabre GDS adapter (UC-023).
 *
 * Supported tools (Phase 1):
 *   sabre.search_flights      -> GET /v1/shop/flights         (InstaFlights)
 *   sabre.destination_finder  -> GET /v2/shop/flights/fares   (Flights To)
 *   sabre.airline_lookup      -> GET /v1/lists/utilities/airlines
 *   sabre.travel_themes       -> GET /v1/shop/themes
 *
 * Auth: OAuth2 Client Credentials with double base64 encoding.
 * Token cached in memory with 7-day TTL (300s refresh buffer).
 */
export class SabreAdapter extends BaseAdapter {
  private readonly auth: SabreAuth;
  private currentToken: string = '';

  constructor(clientId: string, clientSecret: string) {
    super({
      provider: 'sabre',
      baseUrl: 'https://api-crt.cert.havail.sabre.com',
      timeoutMs: 15_000, // Sabre can be slow on flight searches
    });
    this.auth = new SabreAuth(clientId, clientSecret, this.baseUrl);
  }

  /**
   * Override call() to inject OAuth2 token before buildRequest() runs.
   * buildRequest() is sync, but token fetch is async.
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
      case 'sabre.search_flights':
        return this.buildSearchFlightsRequest(params);
      case 'sabre.destination_finder':
        return this.buildDestinationFinderRequest(params);
      case 'sabre.airline_lookup':
        return this.buildAirlineLookupRequest(params);
      case 'sabre.travel_themes':
        return this.buildTravelThemesRequest();
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
      case 'sabre.search_flights': {
        const data = body as SabreInstaFlightsResponse;
        if (!data.PricedItineraries) {
          throw new Error('Missing PricedItineraries in Sabre flight search response');
        }
        return data;
      }
      case 'sabre.destination_finder': {
        const data = body as SabreDestinationFinderResponse;
        if (!data.FareInfo) {
          throw new Error('Missing FareInfo in Sabre destination finder response');
        }
        return data;
      }
      case 'sabre.airline_lookup': {
        const data = body as SabreAirlineResponse;
        if (!data.AirlineInfo) {
          throw new Error('Missing AirlineInfo in Sabre airline lookup response');
        }
        return data;
      }
      case 'sabre.travel_themes': {
        const data = body as SabreThemesResponse;
        if (!data.Themes) {
          throw new Error('Missing Themes in Sabre travel themes response');
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

  private buildSearchFlightsRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const origin = params.origin as string;
    const destination = params.destination as string;
    const departureDate = params.departure_date as string;
    const returnDate = params.return_date as string | undefined;
    const pointOfSale = (params.point_of_sale as string) || 'US';
    const limit = params.limit as number | undefined;

    const qs = new URLSearchParams({
      origin,
      destination,
      departuredate: departureDate,
      pointofsalecountry: pointOfSale,
    });

    if (returnDate) qs.set('returndate', returnDate);
    if (limit) qs.set('limit', String(limit));

    return {
      url: `${this.baseUrl}/v1/shop/flights?${qs.toString()}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.currentToken}` },
    };
  }

  private buildDestinationFinderRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const origin = params.origin as string;
    const departureDate = params.departure_date as string;
    const returnDate = params.return_date as string;
    const pointOfSale = (params.point_of_sale as string) || 'US';
    const maxFare = params.max_fare as number | undefined;

    const qs = new URLSearchParams({
      origin,
      departuredate: departureDate,
      returndate: returnDate,
      pointofsalecountry: pointOfSale,
    });

    if (maxFare) qs.set('maxfare', String(maxFare));

    return {
      url: `${this.baseUrl}/v2/shop/flights/fares?${qs.toString()}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.currentToken}` },
    };
  }

  private buildAirlineLookupRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const airlineCode = params.airline_code as string;

    const qs = new URLSearchParams({ airlinecode: airlineCode });

    return {
      url: `${this.baseUrl}/v1/lists/utilities/airlines?${qs.toString()}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.currentToken}` },
    };
  }

  private buildTravelThemesRequest(): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    return {
      url: `${this.baseUrl}/v1/shop/themes`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.currentToken}` },
    };
  }
}
