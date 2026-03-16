/**
 * NASA Open APIs response types (UC-034).
 *
 * API host: api.nasa.gov (apod, neo, donki, epic)
 *           images-api.nasa.gov (image search — no key)
 * Auth: query param api_key=KEY (except image_search)
 * Free tier: 1,000 req/hour per key
 */

// ---------------------------------------------------------------------------
// Astronomy Picture of the Day (/planetary/apod)
// ---------------------------------------------------------------------------

export interface ApodResponse {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: string;
  copyright?: string;
  thumbnail_url?: string;
  service_version?: string;
}

// ---------------------------------------------------------------------------
// Near-Earth Object Feed (/neo/rest/v1/feed)
// ---------------------------------------------------------------------------

export interface NeoObject {
  id: string;
  neo_reference_id?: string;
  name: string;
  nasa_jpl_url?: string;
  absolute_magnitude_h?: number;
  estimated_diameter?: Record<string, { estimated_diameter_min: number; estimated_diameter_max: number }>;
  is_potentially_hazardous_asteroid?: boolean;
  close_approach_data?: Array<{
    close_approach_date?: string;
    close_approach_date_full?: string;
    epoch_date_close_approach?: number;
    relative_velocity?: Record<string, string>;
    miss_distance?: Record<string, string>;
    orbiting_body?: string;
  }>;
  is_sentry_object?: boolean;
}

export interface NeoFeedResponse {
  element_count: number;
  near_earth_objects: Record<string, NeoObject[]>;
  links?: {
    next?: string;
    previous?: string;
    self?: string;
  };
}

// ---------------------------------------------------------------------------
// DONKI Solar Flares (/DONKI/FLR)
// ---------------------------------------------------------------------------

export interface DonkiFlareEvent {
  flrID: string;
  instruments?: Array<{ displayName?: string }>;
  beginTime?: string;
  peakTime?: string;
  endTime?: string;
  classType?: string;
  sourceLocation?: string;
  activeRegionNum?: number;
  linkedEvents?: Array<{ activityID?: string }>;
  link?: string;
}

export type DonkiFlareResponse = DonkiFlareEvent[];

// ---------------------------------------------------------------------------
// EPIC Earth Polychromatic Imaging Camera (/EPIC/api/natural/date/{date})
// ---------------------------------------------------------------------------

export interface EpicImage {
  identifier: string;
  caption: string;
  image: string;
  date: string;
  centroid_coordinates?: { lat: number; lon: number };
  dscovr_j2000_position?: { x: number; y: number; z: number };
  lunar_j2000_position?: { x: number; y: number; z: number };
  sun_j2000_position?: { x: number; y: number; z: number };
  attitude_quaternions?: { q0: number; q1: number; q2: number; q3: number };
}

export type EpicResponse = EpicImage[];

// ---------------------------------------------------------------------------
// NASA Image & Video Library (images-api.nasa.gov/search)
// ---------------------------------------------------------------------------

export interface NasaImageItem {
  href?: string;
  data?: Array<{
    center?: string;
    title?: string;
    nasa_id?: string;
    date_created?: string;
    media_type?: string;
    description?: string;
    keywords?: string[];
  }>;
  links?: Array<{
    href?: string;
    rel?: string;
    render?: string;
  }>;
}

export interface NasaImageSearchResponse {
  collection: {
    version?: string;
    href?: string;
    items: NasaImageItem[];
    metadata?: { total_hits?: number };
    links?: Array<{ rel?: string; prompt?: string; href?: string }>;
  };
}
