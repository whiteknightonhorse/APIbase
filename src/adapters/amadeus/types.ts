/**
 * Raw Amadeus API response types (UC-022).
 *
 * All Amadeus Self-Service responses share a common envelope:
 *   { data: T[], meta?: {...}, dictionaries?: {...} }
 *
 * Endpoints:
 *   /v2/shopping/flight-offers       — Flight Offers Search
 *   /v1/shopping/flight-offers/pricing — Flight Offers Price
 *   /v2/schedule/flights             — On Demand Flight Status
 *   /v1/reference-data/locations     — Airport & City Search
 *   /v1/reference-data/locations/airports — Airport Nearest
 *   /v1/airport/direct-destinations  — Airport Routes
 *   /v1/reference-data/airlines      — Airline Code Lookup
 */

// ---------------------------------------------------------------------------
// Common envelope
// ---------------------------------------------------------------------------

export interface AmadeusResponse<T> {
  data: T[];
  meta?: {
    count?: number;
    links?: { self?: string; next?: string; last?: string };
  };
  dictionaries?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// /v2/shopping/flight-offers (Flight Offers Search)
// ---------------------------------------------------------------------------

export interface AmadeusFlightSegment {
  departure: { iataCode: string; terminal?: string; at: string };
  arrival: { iataCode: string; terminal?: string; at: string };
  carrierCode: string;
  number: string;
  aircraft: { code: string };
  operating?: { carrierCode: string };
  duration: string;
  numberOfStops: number;
}

export interface AmadeusFlightItinerary {
  duration: string;
  segments: AmadeusFlightSegment[];
}

export interface AmadeusFlightPrice {
  currency: string;
  total: string;
  base: string;
  fees?: Array<{ amount: string; type: string }>;
  grandTotal: string;
}

export interface AmadeusFlightOffer {
  type: string;
  id: string;
  source: string;
  instantTicketingRequired: boolean;
  nonHomogeneous: boolean;
  oneWay: boolean;
  lastTicketingDate: string;
  numberOfBookableSeats: number;
  itineraries: AmadeusFlightItinerary[];
  price: AmadeusFlightPrice;
  pricingOptions: { fareType: string[]; includedCheckedBagsOnly: boolean };
  validatingAirlineCodes: string[];
  travelerPricings: Array<{
    travelerId: string;
    fareOption: string;
    travelerType: string;
    price: { currency: string; total: string; base: string };
    fareDetailsBySegment: Array<{
      segmentId: string;
      cabin: string;
      fareBasis: string;
      class: string;
      includedCheckedBags?: { weight?: number; weightUnit?: string; quantity?: number };
    }>;
  }>;
}

export type AmadeusFlightSearchResponse = AmadeusResponse<AmadeusFlightOffer>;

// ---------------------------------------------------------------------------
// /v1/shopping/flight-offers/pricing (Flight Offers Price)
// ---------------------------------------------------------------------------

export interface AmadeusFlightPriceOffer extends AmadeusFlightOffer {
  paymentCardRequired?: boolean;
}

export type AmadeusFlightPriceResponse = AmadeusResponse<AmadeusFlightPriceOffer>;

// ---------------------------------------------------------------------------
// /v2/schedule/flights (On Demand Flight Status)
// ---------------------------------------------------------------------------

export interface AmadeusFlightStatusSegment {
  boardPointIataCode: string;
  offPointIataCode: string;
  scheduledDepartureDate: string;
  scheduledDepartureTime?: string;
  estimatedDepartureDate?: string;
  scheduledArrivalDate?: string;
  scheduledArrivalTime?: string;
  estimatedArrivalDate?: string;
  estimatedArrivalTime?: string;
  departure?: { terminal?: string; gate?: string };
  arrival?: { terminal?: string; gate?: string };
}

export interface AmadeusFlightStatus {
  type: string;
  scheduledDepartureDate: string;
  flightDesignator: {
    carrierCode: string;
    flightNumber: number;
  };
  flightPoints: Array<{
    iataCode: string;
    departure?: { timings: Array<{ qualifier: string; value: string }> };
    arrival?: { timings: Array<{ qualifier: string; value: string }> };
  }>;
  segments: AmadeusFlightStatusSegment[];
  legs: Array<{
    boardPointIataCode: string;
    offPointIataCode: string;
    aircraftEquipment: { aircraftType: string };
    scheduledLegDuration?: string;
  }>;
}

export type AmadeusFlightStatusResponse = AmadeusResponse<AmadeusFlightStatus>;

// ---------------------------------------------------------------------------
// /v1/reference-data/locations (Airport & City Search)
// ---------------------------------------------------------------------------

export interface AmadeusLocation {
  type: string;
  subType: string;
  name: string;
  detailedName: string;
  id: string;
  iataCode: string;
  address: { cityName: string; cityCode: string; countryName: string; countryCode: string };
  geoCode: { latitude: number; longitude: number };
  timeZoneOffset?: string;
}

export type AmadeusLocationResponse = AmadeusResponse<AmadeusLocation>;

// ---------------------------------------------------------------------------
// /v1/reference-data/locations/airports (Airport Nearest)
// ---------------------------------------------------------------------------

export interface AmadeusNearestAirport extends AmadeusLocation {
  distance: { value: number; unit: string };
  relevance: number;
}

export type AmadeusNearestAirportResponse = AmadeusResponse<AmadeusNearestAirport>;

// ---------------------------------------------------------------------------
// /v1/airport/direct-destinations (Airport Routes)
// ---------------------------------------------------------------------------

export interface AmadeusDirectDestination {
  type: string;
  id: string;
  subType: string;
  name: string;
  iataCode: string;
}

export type AmadeusDirectDestinationResponse = AmadeusResponse<AmadeusDirectDestination>;

// ---------------------------------------------------------------------------
// /v1/reference-data/airlines (Airline Code Lookup)
// ---------------------------------------------------------------------------

export interface AmadeusAirline {
  type: string;
  iataCode: string;
  icaoCode?: string;
  businessName: string;
  commonName: string;
}

export type AmadeusAirlineResponse = AmadeusResponse<AmadeusAirline>;
