/**
 * Ticketmaster Discovery API response types (UC-008).
 *
 * API host: app.ticketmaster.com
 * Auth: ?apikey=KEY (query parameter)
 * Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export interface TmImage {
  url: string;
  ratio?: string;
  width?: number;
  height?: number;
  fallback?: boolean;
}

export interface TmDateStart {
  localDate?: string;
  localTime?: string;
  dateTime?: string;
  dateTBD?: boolean;
  dateTBA?: boolean;
  timeTBA?: boolean;
  noSpecificTime?: boolean;
}

export interface TmDate {
  start?: TmDateStart;
  timezone?: string;
  status?: { code: string };
  spanMultipleDays?: boolean;
}

export interface TmPriceRange {
  type?: string;
  currency?: string;
  min?: number;
  max?: number;
}

// ---------------------------------------------------------------------------
// Venue
// ---------------------------------------------------------------------------

export interface TmVenue {
  id: string;
  name: string;
  type?: string;
  url?: string;
  locale?: string;
  postalCode?: string;
  timezone?: string;
  city?: { name: string };
  state?: { name: string; stateCode?: string };
  country?: { name: string; countryCode: string };
  address?: { line1?: string; line2?: string };
  location?: { longitude: string; latitude: string };
  images?: TmImage[];
}

// ---------------------------------------------------------------------------
// Attraction
// ---------------------------------------------------------------------------

export interface TmAttraction {
  id: string;
  name: string;
  type?: string;
  url?: string;
  locale?: string;
  images?: TmImage[];
  classifications?: TmClassification[];
  externalLinks?: Record<string, { url: string }[]>;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface TmClassification {
  primary?: boolean;
  segment?: { id: string; name: string };
  genre?: { id: string; name: string };
  subGenre?: { id: string; name: string };
  type?: { id: string; name: string };
  subType?: { id: string; name: string };
  family?: boolean;
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export interface TmEvent {
  id: string;
  name: string;
  type?: string;
  url?: string;
  locale?: string;
  images?: TmImage[];
  dates?: TmDate;
  classifications?: TmClassification[];
  priceRanges?: TmPriceRange[];
  promoter?: { id: string; name: string };
  info?: string;
  pleaseNote?: string;
  seatmap?: { staticUrl?: string };
  accessibility?: { ticketLimit?: number };
  _embedded?: {
    venues?: TmVenue[];
    attractions?: TmAttraction[];
  };
}

// ---------------------------------------------------------------------------
// Paginated Responses
// ---------------------------------------------------------------------------

export interface TmPage {
  size: number;
  totalElements: number;
  totalPages: number;
  number: number;
}

export interface TmEventsResponse {
  _embedded?: {
    events: TmEvent[];
  };
  page: TmPage;
}

export interface TmClassificationsResponse {
  _embedded?: {
    classifications: TmClassification[];
  };
  page: TmPage;
}
