/**
 * Travelpayouts / Aviasales API response types (UC-002).
 */

/** GET /v2/prices/latest */
export interface LatestPricesResponse {
  success: boolean;
  data: Array<{
    origin: string;
    destination: string;
    depart_date: string;
    return_date: string;
    number_of_changes: number;
    value: number;
    gate: string;
    found_at: string;
    distance: number;
    actual: boolean;
    trip_class: number;
  }>;
  currency: string;
}

/** GET /v1/prices/calendar */
export interface PriceCalendarResponse {
  success: boolean;
  data: Record<
    string,
    {
      price: number;
      airline: string;
      flight_number: number;
      departure_at: string;
      return_at: string;
      expires_at: string;
      number_of_changes: number;
    }
  >;
  currency: string;
}

/** GET /v1/prices/cheap */
export interface CheapFlightsResponse {
  success: boolean;
  data: Record<
    string,
    Record<
      string,
      {
        price: number;
        airline: string;
        flight_number: number;
        departure_at: string;
        return_at: string;
        expires_at: string;
        number_of_changes: number;
      }
    >
  >;
  currency: string;
}

/** GET /v1/city-directions */
export interface CityDirectionsResponse {
  success: boolean;
  data: Record<
    string,
    {
      origin: string;
      destination: string;
      price: number;
      transfers: number;
      airline: string;
      flight_number: number;
      departure_at: string;
      return_at: string;
      expires_at: string;
    }
  >;
  currency: string;
}

/** GET /v2/prices/nearest-places-matrix */
export interface NearbyDestinationsResponse {
  prices: Array<{
    origin: string;
    destination: string;
    depart_date: string;
    return_date: string;
    number_of_changes: number;
    value: number;
    distance: number;
    actual: boolean;
    found_at: string;
    gate: string;
    trip_class: number;
  }>;
  currency: string;
}

/** GET /data/en/airports.json */
export interface AirportEntry {
  code: string;
  name: string;
  city_code: string;
  country_code: string;
  name_translations: Record<string, string>;
  time_zone: string;
  flightable: boolean;
  coordinates: {
    lat: number;
    lon: number;
  };
}
