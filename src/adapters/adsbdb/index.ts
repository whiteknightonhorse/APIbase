import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  AdsbdbAircraftResponse,
  AdsbdbAirlineResponse,
  AdsbdbCallsignResponse,
} from './types';

/**
 * ADS-B DB adapter (UC-529).
 *
 * Supported tools (read-only):
 *   adsbdb.aircraft_lookup  → GET /v0/aircraft/{identifier}
 *   adsbdb.airline_lookup   → GET /v0/airline/{code}
 *   adsbdb.callsign_lookup  → GET /v0/callsign/{callsign}
 *
 * Auth: None (MIT license, public access, no registration required).
 */
export class AdsbdbAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'adsbdb',
      baseUrl: 'https://api.adsbdb.com/v0',
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
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'adsbdb.aircraft_lookup': {
        const identifier = encodeURIComponent(String(params.identifier ?? ''));
        return {
          url: `${this.baseUrl}/aircraft/${identifier}`,
          method: 'GET',
          headers,
        };
      }
      case 'adsbdb.airline_lookup': {
        const code = encodeURIComponent(String(params.code ?? ''));
        return {
          url: `${this.baseUrl}/airline/${code}`,
          method: 'GET',
          headers,
        };
      }
      case 'adsbdb.callsign_lookup': {
        const callsign = encodeURIComponent(String(params.callsign ?? ''));
        return {
          url: `${this.baseUrl}/callsign/${callsign}`,
          method: 'GET',
          headers,
        };
      }
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
      case 'adsbdb.aircraft_lookup': {
        const data = body as unknown as AdsbdbAircraftResponse;
        const aircraft = data.response?.aircraft;
        if (!aircraft) {
          return { found: false, aircraft: null };
        }
        return {
          found: true,
          aircraft: {
            mode_s: aircraft.mode_s,
            registration: aircraft.registration,
            type: aircraft.type,
            icao_type: aircraft.icao_type,
            manufacturer: aircraft.manufacturer,
            owner: aircraft.registered_owner,
            owner_country: aircraft.registered_owner_country_name,
            owner_country_iso: aircraft.registered_owner_country_iso_name,
            operator_flag: aircraft.registered_owner_operator_flag_code,
            photo_url: aircraft.url_photo,
            photo_thumbnail_url: aircraft.url_photo_thumbnail,
          },
        };
      }
      case 'adsbdb.airline_lookup': {
        const data = body as unknown as AdsbdbAirlineResponse;
        const airlines = Array.isArray(data.response) ? data.response : [];
        return {
          found: airlines.length > 0,
          count: airlines.length,
          airlines: airlines.map((a) => ({
            name: a.name,
            icao: a.icao,
            iata: a.iata,
            country: a.country,
            country_iso: a.country_iso,
            callsign: a.callsign,
          })),
        };
      }
      case 'adsbdb.callsign_lookup': {
        const data = body as unknown as AdsbdbCallsignResponse;
        const route = data.response?.flightroute;
        if (!route) {
          return { found: false, flightroute: null };
        }
        return {
          found: true,
          flightroute: {
            callsign: route.callsign,
            callsign_icao: route.callsign_icao,
            callsign_iata: route.callsign_iata,
            airline: route.airline
              ? {
                  name: route.airline.name,
                  icao: route.airline.icao,
                  iata: route.airline.iata,
                  country: route.airline.country,
                  callsign: route.airline.callsign,
                }
              : null,
            origin: route.origin
              ? {
                  icao: route.origin.icao_code,
                  iata: route.origin.iata_code,
                  name: route.origin.name,
                  municipality: route.origin.municipality,
                  country: route.origin.country_name,
                  country_iso: route.origin.country_iso_name,
                  latitude: route.origin.latitude,
                  longitude: route.origin.longitude,
                  elevation_ft: route.origin.elevation,
                }
              : null,
            destination: route.destination
              ? {
                  icao: route.destination.icao_code,
                  iata: route.destination.iata_code,
                  name: route.destination.name,
                  municipality: route.destination.municipality,
                  country: route.destination.country_name,
                  country_iso: route.destination.country_iso_name,
                  latitude: route.destination.latitude,
                  longitude: route.destination.longitude,
                  elevation_ft: route.destination.elevation,
                }
              : null,
          },
        };
      }
      default:
        return body;
    }
  }
}
