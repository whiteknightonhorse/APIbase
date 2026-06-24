import { z, type ZodSchema } from 'zod';

const placeSearch = z
  .object({
    q: z
      .string()
      .optional()
      .describe(
        'Full-text search query across place names, alternate names, and feature codes (e.g. "Paris", "Mont Blanc")',
      ),
    name: z
      .string()
      .optional()
      .describe(
        'Search by exact or partial official place name (more precise than q; e.g. "New York")',
      ),
    country: z
      .string()
      .length(2)
      .optional()
      .describe('Filter results to this ISO-3166 2-letter country code (e.g. "US", "FR", "DE")'),
    feature_class: z
      .enum(['A', 'H', 'L', 'P', 'R', 'S', 'T', 'U', 'V'])
      .optional()
      .describe(
        'GeoNames feature class: A=administrative, H=hydrographic, L=parks/area, P=populated place, R=road, S=spot/building, T=mountain/hill, U=undersea, V=vegetation',
      ),
    feature_code: z
      .string()
      .optional()
      .describe(
        'GeoNames feature code for fine-grained filtering (e.g. "PPLC"=capital, "MT"=mountain, "STM"=stream)',
      ),
    language: z
      .string()
      .optional()
      .describe(
        'ISO 639-1 language code for localized names in the response (e.g. "en", "fr", "de")',
      ),
    max_rows: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of results to return (default 10, max 1000)'),
    start_row: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based offset for pagination (default 0)'),
    order_by: z
      .enum(['relevance', 'population', 'elevation', 'wikipedia'])
      .optional()
      .describe(
        'Sort order: "relevance" (default, best name match), "population" (largest first), "elevation" (highest first), "wikipedia" (most linked)',
      ),
  })
  .strip();

const postalLookup = z
  .object({
    postal_code: z
      .string()
      .optional()
      .describe('Postal / ZIP code to look up (e.g. "10001" for New York, "SW1A 1AA" for London)'),
    place_name: z
      .string()
      .optional()
      .describe(
        'Place or city name to search postal codes for (e.g. "Berlin", "Sydney"). Use with country for best results.',
      ),
    country: z
      .string()
      .length(2)
      .optional()
      .describe(
        'ISO-3166 2-letter country code to restrict the postal code search (e.g. "US", "GB", "DE")',
      ),
    max_rows: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of results to return (default 10, max 1000)'),
  })
  .strip();

const countryInfo = z
  .object({
    country: z
      .string()
      .length(2)
      .optional()
      .describe(
        'ISO-3166 2-letter country code (e.g. "US", "DE", "JP"). Omit to retrieve all countries.',
      ),
    language: z
      .string()
      .optional()
      .describe('ISO 639-1 language code for localized country names (e.g. "en", "fr", "es")'),
  })
  .strip();

const placeTimezone = z
  .object({
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe('Latitude of the location to look up (-90 to 90, e.g. 40.7128 for New York City)'),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe(
        'Longitude of the location to look up (-180 to 180, e.g. -74.0060 for New York City)',
      ),
    language: z
      .string()
      .optional()
      .describe('ISO 639-1 language code for the country name in the response (e.g. "en", "de")'),
  })
  .strip();

export const geonamesSchemas: Record<string, ZodSchema> = {
  'geonames.place.search': placeSearch,
  'geonames.postal.lookup': postalLookup,
  'geonames.country.info': countryInfo,
  'geonames.place.timezone': placeTimezone,
};
