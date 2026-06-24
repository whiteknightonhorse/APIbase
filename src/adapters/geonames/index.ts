import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GeoNamesSearchResponse,
  PostalCodeSearchResponse,
  CountryInfoResponse,
  TimezoneResponse,
} from './types';

/**
 * GeoNames geographical database adapter (UC-512).
 *
 * Supported tools (read-only):
 *   geonames.place.search   → GET /searchJSON
 *   geonames.postal.lookup  → GET /postalCodeSearchJSON
 *   geonames.country.info   → GET /countryInfoJSON
 *   geonames.place.timezone → GET /timezoneJSON
 *
 * Auth: username query param (registered free account, username=APIbase).
 */
export class GeoNamesAdapter extends BaseAdapter {
  private readonly username: string;

  constructor(username: string) {
    super({
      provider: 'geonames',
      baseUrl: 'https://secure.geonames.org',
    });
    this.username = username;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'geonames.place.search':
        return this.buildSearchRequest(params, headers);
      case 'geonames.postal.lookup':
        return this.buildPostalRequest(params, headers);
      case 'geonames.country.info':
        return this.buildCountryInfoRequest(params, headers);
      case 'geonames.place.timezone':
        return this.buildTimezoneRequest(params, headers);
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
      case 'geonames.place.search': {
        const data = body as unknown as GeoNamesSearchResponse;
        return {
          total: data.totalResultsCount,
          count: data.geonames?.length ?? 0,
          places: (data.geonames ?? []).map((g) => ({
            geoname_id: g.geonameId,
            name: g.name,
            toponym_name: g.toponymName,
            latitude: parseFloat(g.lat),
            longitude: parseFloat(g.lng),
            country_code: g.countryCode,
            country_name: g.countryName,
            feature_class: g.fcl,
            feature_class_name: g.fclName,
            feature_code: g.fcode,
            feature_code_name: g.fcodeName,
            admin1_code: g.adminCode1,
            admin1_name: g.adminName1,
            admin2_name: g.adminName2,
            population: g.population,
            wikipedia: g.wikipedia,
            bbox: g.bbox,
          })),
        };
      }

      case 'geonames.postal.lookup': {
        const data = body as unknown as PostalCodeSearchResponse;
        return {
          count: data.postalCodes?.length ?? 0,
          postal_codes: (data.postalCodes ?? []).map((p) => ({
            postal_code: p.postalCode,
            place_name: p.placeName,
            country_code: p.countryCode,
            latitude: p.lat,
            longitude: p.lng,
            admin1_code: p.adminCode1,
            admin1_name: p.adminName1,
            admin2_name: p.adminName2,
            iso3166_2: p['ISO3166-2'],
          })),
        };
      }

      case 'geonames.country.info': {
        const data = body as unknown as CountryInfoResponse;
        return {
          count: data.geonames?.length ?? 0,
          countries: (data.geonames ?? []).map((c) => ({
            country_code: c.countryCode,
            country_name: c.countryName,
            iso_alpha3: c.isoAlpha3,
            iso_numeric: c.isoNumeric,
            continent: c.continent,
            continent_name: c.continentName,
            capital: c.capital,
            languages: c.languages,
            geoname_id: c.geonameId,
            population: parseInt(c.population, 10),
            area_sq_km: parseFloat(c.areaInSqKm),
            currency_code: c.currencyCode,
            postal_code_format: c.postalCodeFormat,
            bbox: {
              north: c.north,
              south: c.south,
              east: c.east,
              west: c.west,
            },
          })),
        };
      }

      case 'geonames.place.timezone': {
        const data = body as unknown as TimezoneResponse;
        return {
          latitude: data.lat,
          longitude: data.lng,
          country_code: data.countryCode,
          country_name: data.countryName,
          timezone_id: data.timezoneId,
          gmt_offset: data.gmtOffset,
          raw_offset: data.rawOffset,
          dst_offset: data.dstOffset,
          local_time: data.time,
          sunrise: data.sunrise,
          sunset: data.sunset,
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
    qs.set('username', this.username);
    qs.set('type', 'json');
    if (params.q) qs.set('q', String(params.q));
    if (params.name) qs.set('name', String(params.name));
    if (params.country) qs.set('country', String(params.country));
    if (params.feature_class) qs.set('featureClass', String(params.feature_class));
    if (params.feature_code) qs.set('featureCode', String(params.feature_code));
    if (params.language) qs.set('lang', String(params.language));
    if (params.max_rows !== undefined) qs.set('maxRows', String(params.max_rows));
    else qs.set('maxRows', '10');
    if (params.start_row !== undefined) qs.set('startRow', String(params.start_row));
    qs.set('orderby', String(params.order_by ?? 'relevance'));

    return {
      url: `${this.baseUrl}/searchJSON?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildPostalRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('username', this.username);
    if (params.postal_code) qs.set('postalcode', encodeURIComponent(String(params.postal_code)));
    if (params.place_name) qs.set('placename', encodeURIComponent(String(params.place_name)));
    if (params.country) qs.set('country', encodeURIComponent(String(params.country)));
    if (params.max_rows !== undefined) qs.set('maxRows', String(params.max_rows));
    else qs.set('maxRows', '10');

    return {
      url: `${this.baseUrl}/postalCodeSearchJSON?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildCountryInfoRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('username', this.username);
    if (params.country) qs.set('country', encodeURIComponent(String(params.country)));
    if (params.language) qs.set('lang', String(params.language));

    return {
      url: `${this.baseUrl}/countryInfoJSON?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildTimezoneRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('username', this.username);
    qs.set('lat', String(params.latitude));
    qs.set('lng', String(params.longitude));
    if (params.language) qs.set('lang', String(params.language));

    return {
      url: `${this.baseUrl}/timezoneJSON?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
