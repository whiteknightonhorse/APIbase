import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// geo.geocode — Address/place geocoding (Geoapify)
// ---------------------------------------------------------------------------

const geoGeocode = z
  .object({
    text: z
      .string()
      .min(1)
      .max(500)
      .describe('Address, place name, or landmark to geocode (e.g. "1600 Pennsylvania Ave, Washington DC", "Eiffel Tower").'),
    lang: z
      .string()
      .min(2)
      .max(5)
      .optional()
      .describe('Result language code (e.g. "en", "de", "ru"). Default: English.'),
    country_code: z
      .string()
      .min(2)
      .max(2)
      .optional()
      .describe('ISO 3166-1 alpha-2 country code to filter results (e.g. "US", "DE", "FR").'),
    type: z
      .enum(['city', 'street', 'amenity', 'country'])
      .optional()
      .describe('Filter by result type: city, street, amenity, or country.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe('Maximum number of results to return (default 1, max 5).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// geo.reverse_geocode — Coordinates to address (Geoapify)
// ---------------------------------------------------------------------------

const geoReverseGeocode = z
  .object({
    lat: z
      .number()
      .min(-90)
      .max(90)
      .describe('Latitude of the point to reverse geocode.'),
    lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Longitude of the point to reverse geocode.'),
    lang: z
      .string()
      .min(2)
      .max(5)
      .optional()
      .describe('Result language code (e.g. "en", "de", "ru"). Default: English.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// geo.place_search — POI / places search (Geoapify Places v2)
// ---------------------------------------------------------------------------

const geoPlaceSearch = z
  .object({
    categories: z
      .string()
      .min(1)
      .max(200)
      .describe(
        'POI category filter (e.g. "catering.restaurant", "healthcare.pharmacy", "tourism.attraction", "accommodation.hotel"). Multiple categories separated by comma.',
      ),
    lat: z
      .number()
      .min(-90)
      .max(90)
      .describe('Center latitude for the search area.'),
    lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Center longitude for the search area.'),
    radius: z
      .number()
      .int()
      .min(100)
      .max(50000)
      .optional()
      .describe('Search radius in meters (default 1000, max 50000).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results (default 20, max 50).'),
    lang: z
      .string()
      .min(2)
      .max(5)
      .optional()
      .describe('Result language code (e.g. "en", "de", "ru"). Default: English.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// geo.autocomplete — Address/place autocomplete (Geoapify)
// ---------------------------------------------------------------------------

const geoAutocomplete = z
  .object({
    text: z
      .string()
      .min(1)
      .max(200)
      .describe('Partial address or place name to autocomplete (e.g. "1600 Penn", "Berlin Bran").'),
    lang: z
      .string()
      .min(2)
      .max(5)
      .optional()
      .describe('Result language code (e.g. "en", "de", "ru"). Default: English.'),
    country_code: z
      .string()
      .min(2)
      .max(2)
      .optional()
      .describe('ISO 3166-1 alpha-2 country code to filter results (e.g. "US", "DE").'),
    type: z
      .enum(['city', 'street', 'amenity', 'country'])
      .optional()
      .describe('Filter by result type: city, street, amenity, or country.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe('Maximum number of suggestions (default 5, max 5).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// geo.routing — Turn-by-turn routing (Geoapify)
// ---------------------------------------------------------------------------

const geoRouting = z
  .object({
    origin_lat: z
      .number()
      .min(-90)
      .max(90)
      .describe('Start point latitude.'),
    origin_lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Start point longitude.'),
    dest_lat: z
      .number()
      .min(-90)
      .max(90)
      .describe('Destination latitude.'),
    dest_lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Destination longitude.'),
    mode: z
      .enum(['drive', 'walk', 'bicycle', 'transit'])
      .optional()
      .describe('Travel mode: drive, walk, bicycle, or transit. Default: drive.'),
    lang: z
      .string()
      .min(2)
      .max(5)
      .optional()
      .describe('Turn-by-turn instruction language (e.g. "en", "de"). Default: English.'),
    units: z
      .enum(['metric', 'imperial'])
      .optional()
      .describe('Distance units: metric (km) or imperial (miles). Default: metric.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// geo.isochrone — Reachability area (Geoapify Isoline)
// ---------------------------------------------------------------------------

const geoIsochrone = z
  .object({
    lat: z
      .number()
      .min(-90)
      .max(90)
      .describe('Center point latitude.'),
    lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Center point longitude.'),
    mode: z
      .enum(['drive', 'walk', 'bicycle'])
      .optional()
      .describe('Travel mode: drive, walk, or bicycle. Default: drive.'),
    time: z
      .number()
      .int()
      .min(60)
      .max(7200)
      .optional()
      .describe('Reachability time in seconds (default 900 = 15 min, max 7200 = 2h). Mutually exclusive with distance.'),
    distance: z
      .number()
      .int()
      .min(100)
      .max(100000)
      .optional()
      .describe('Reachability distance in meters (max 100km). Mutually exclusive with time.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// geo.ip_geolocation — IP address geolocation (Geoapify)
// ---------------------------------------------------------------------------

const geoIpGeolocation = z
  .object({
    ip: z
      .string()
      .min(7)
      .max(45)
      .describe('IPv4 or IPv6 address to geolocate (e.g. "8.8.8.8", "2001:4860:4860::8888").'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const geoSchemas: Record<string, ZodSchema> = {
  'geo.geocode': geoGeocode,
  'geo.reverse_geocode': geoReverseGeocode,
  'geo.place_search': geoPlaceSearch,
  'geo.autocomplete': geoAutocomplete,
  'geo.routing': geoRouting,
  'geo.isochrone': geoIsochrone,
  'geo.ip_geolocation': geoIpGeolocation,
};
