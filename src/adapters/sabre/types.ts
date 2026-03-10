/**
 * Raw Sabre GDS API response types (UC-023).
 *
 * Endpoints:
 *   /v1/shop/flights         — InstaFlights Search (real-time flight offers)
 *   /v2/shop/flights/fares   — Destination Finder (cheapest fares from origin)
 *   /v1/lists/utilities/airlines — Airlines Lookup
 *   /v1/shop/themes          — Travel Themes
 */

// ---------------------------------------------------------------------------
// /v1/shop/flights (InstaFlights Search)
// ---------------------------------------------------------------------------

export interface SabreFlightSegment {
  DepartureDateTime: string;
  ArrivalDateTime: string;
  FlightNumber: string;
  ResBookDesigCode: string;
  ElapsedTime: number;
  DepartureAirport: { LocationCode: string };
  ArrivalAirport: { LocationCode: string };
  MarketingAirline: { Code: string; FlightNumber: string };
  OperatingAirline?: { Code: string; FlightNumber: string };
  Equipment?: { AirEquipType: string };
}

export interface SabreFlightLeg {
  ElapsedTime: number;
  FlightSegment: SabreFlightSegment[];
}

export interface SabrePricedItinerary {
  SequenceNumber: number;
  AirItinerary: {
    DirectionInd: string;
    OriginDestinationOptions: {
      OriginDestinationOption: SabreFlightLeg[];
    };
  };
  AirItineraryPricingInfo: {
    ItinTotalFare: {
      TotalFare: { Amount: number; CurrencyCode: string };
      BaseFare?: { Amount: number; CurrencyCode: string };
      Taxes?: { Tax: Array<{ Amount: number; TaxCode: string }> };
    };
    PTC_FareBreakdowns?: {
      PTC_FareBreakdown: Array<{
        PassengerTypeQuantity: { Code: string; Quantity: number };
        PassengerFare: {
          TotalFare: { Amount: number; CurrencyCode: string };
        };
      }>;
    };
  };
  TicketingInfo: { ValidInterline: string };
}

export interface SabreInstaFlightsResponse {
  PricedItineraries: SabrePricedItinerary[];
  Links?: Array<{ rel: string; href: string }>;
}

// ---------------------------------------------------------------------------
// /v2/shop/flights/fares (Destination Finder)
// ---------------------------------------------------------------------------

export interface SabreFareInfo {
  DestinationLocation: string;
  DepartureDateTime: string;
  ReturnDateTime: string;
  LowestFare: {
    Fare: number;
    CurrencyCode: string;
    AirlineCodes: string[];
  };
  LowestNonStopFare?: {
    Fare: number;
    CurrencyCode: string;
    AirlineCodes: string[];
  };
}

export interface SabreDestinationFinderResponse {
  FareInfo: SabreFareInfo[];
  Links?: Array<{ rel: string; href: string }>;
}

// ---------------------------------------------------------------------------
// /v1/lists/utilities/airlines
// ---------------------------------------------------------------------------

export interface SabreAirlineInfo {
  AirlineCode: string;
  AirlineName: string;
}

export interface SabreAirlineResponse {
  AirlineInfo: SabreAirlineInfo[];
}

// ---------------------------------------------------------------------------
// /v1/shop/themes
// ---------------------------------------------------------------------------

export interface SabreTheme {
  Theme: string;
  Links?: Array<{ rel: string; href: string }>;
}

export interface SabreThemesResponse {
  Themes: SabreTheme[];
  Links?: Array<{ rel: string; href: string }>;
}
