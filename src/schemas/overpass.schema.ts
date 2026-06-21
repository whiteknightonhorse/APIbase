import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// overpass.amenities — Find OSM amenities by type in a bounding box
// ---------------------------------------------------------------------------

const overpassAmenities = z
  .object({
    amenity_type: z
      .enum([
        'restaurant',
        'cafe',
        'bar',
        'pub',
        'fast_food',
        'bank',
        'atm',
        'pharmacy',
        'hospital',
        'clinic',
        'doctors',
        'dentist',
        'school',
        'university',
        'library',
        'fuel',
        'parking',
        'hotel',
        'supermarket',
        'marketplace',
        'post_office',
        'police',
        'fire_station',
        'cinema',
        'theatre',
        'museum',
        'place_of_worship',
        'toilets',
        'charging_station',
      ])
      .describe(
        'OSM amenity type to search for (e.g. "restaurant", "cafe", "atm", "hospital", "pharmacy", "school").',
      ),
    lat_min: z
      .number()
      .min(-90)
      .max(90)
      .describe('Southern boundary latitude of the search bounding box (e.g. 51.50).'),
    lon_min: z
      .number()
      .min(-180)
      .max(180)
      .describe('Western boundary longitude of the search bounding box (e.g. -0.13).'),
    lat_max: z
      .number()
      .min(-90)
      .max(90)
      .describe('Northern boundary latitude of the search bounding box (e.g. 51.52).'),
    lon_max: z
      .number()
      .min(-180)
      .max(180)
      .describe('Eastern boundary longitude of the search bounding box (e.g. -0.10).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (1–50, default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// overpass.pois_nearby — Find POIs within a radius of a lat/lon point
// ---------------------------------------------------------------------------

const overpassPoisNearby = z
  .object({
    lat: z.number().min(-90).max(90).describe('Center point latitude (e.g. 48.8566 for Paris).'),
    lon: z.number().min(-180).max(180).describe('Center point longitude (e.g. 2.3522 for Paris).'),
    radius_m: z
      .number()
      .int()
      .min(50)
      .max(5000)
      .optional()
      .describe('Search radius in meters from the center point (50–5000, default 500).'),
    amenity_type: z
      .enum([
        'restaurant',
        'cafe',
        'bar',
        'pub',
        'fast_food',
        'bank',
        'atm',
        'pharmacy',
        'hospital',
        'clinic',
        'doctors',
        'dentist',
        'school',
        'university',
        'library',
        'fuel',
        'parking',
        'hotel',
        'supermarket',
        'marketplace',
        'post_office',
        'police',
        'fire_station',
        'cinema',
        'theatre',
        'museum',
        'place_of_worship',
        'toilets',
        'charging_station',
      ])
      .optional()
      .describe(
        'Optional amenity type filter. Omit to search all OSM amenities, tourism, and shops within the radius.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (1–50, default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// overpass.named_place — Search named places/streets/landmarks by name
// ---------------------------------------------------------------------------

const overpassNamedPlace = z
  .object({
    name: z
      .string()
      .min(2)
      .max(200)
      .describe(
        'Name or partial name to search for (case-insensitive regex). E.g. "Central Park", "Baker Street", "Eiffel".',
      ),
    feature_type: z
      .enum(['all', 'node', 'way', 'relation'])
      .optional()
      .describe(
        'OSM element type to search: "node" (points), "way" (roads/areas), "relation" (complex features), "all" (default).',
      ),
    lat_min: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe('Optional southern boundary latitude to constrain the search area.'),
    lon_min: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe('Optional western boundary longitude to constrain the search area.'),
    lat_max: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe('Optional northern boundary latitude to constrain the search area.'),
    lon_max: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe('Optional eastern boundary longitude to constrain the search area.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Maximum number of results to return (1–30, default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// overpass.public_transport — Find public transit stops/stations in a bbox
// ---------------------------------------------------------------------------

const overpassPublicTransport = z
  .object({
    lat_min: z
      .number()
      .min(-90)
      .max(90)
      .describe('Southern boundary latitude of the search bounding box.'),
    lon_min: z
      .number()
      .min(-180)
      .max(180)
      .describe('Western boundary longitude of the search bounding box.'),
    lat_max: z
      .number()
      .min(-90)
      .max(90)
      .describe('Northern boundary latitude of the search bounding box.'),
    lon_max: z
      .number()
      .min(-180)
      .max(180)
      .describe('Eastern boundary longitude of the search bounding box.'),
    transport_type: z
      .enum(['all', 'bus', 'train', 'subway', 'tram', 'ferry'])
      .optional()
      .describe(
        'Type of public transport to find: "bus" (bus stops), "train" (railway stations), "subway" (metro stations), "tram" (tram stops), "ferry" (ferry terminals), "all" (all types, default).',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (1–50, default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const overpassSchemas: Record<string, ZodSchema> = {
  'overpass.amenities': overpassAmenities,
  'overpass.pois_nearby': overpassPoisNearby,
  'overpass.named_place': overpassNamedPlace,
  'overpass.public_transport': overpassPublicTransport,
};
