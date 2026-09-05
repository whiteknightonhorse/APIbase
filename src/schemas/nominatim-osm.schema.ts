import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .describe(
        'Free-form search text (e.g. "1600 Amphitheatre Parkway, Mountain View" or "Eiffel Tower")',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of matches to return (1-50, default 5)'),
    country_codes: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe(
        'Comma-separated ISO 3166-1 alpha-2 country codes to restrict the search to (e.g. "us,ca")',
      ),
    language: z
      .string()
      .trim()
      .max(35)
      .optional()
      .describe('Preferred response language as an Accept-Language value (e.g. "en", "de-DE")'),
  })
  .strip();

const reverse = z
  .object({
    lat: z.number().min(-90).max(90).describe('Latitude of the point to resolve to an address'),
    lon: z.number().min(-180).max(180).describe('Longitude of the point to resolve to an address'),
    zoom: z
      .number()
      .int()
      .min(0)
      .max(18)
      .optional()
      .describe(
        'Level of detail for the resolved address (0=country, 10=city, 18=building, default varies by feature)',
      ),
    language: z
      .string()
      .trim()
      .max(35)
      .optional()
      .describe('Preferred response language as an Accept-Language value (e.g. "en", "de-DE")'),
  })
  .strip();

const lookup = z
  .object({
    osm_ids: z
      .array(z.string().trim().min(2).max(20))
      .min(1)
      .max(50)
      .describe(
        'OSM object IDs to resolve, each prefixed with its type: N (node), W (way), or R (relation) — e.g. ["R146656", "W284493291"]. Max 50.',
      ),
    language: z
      .string()
      .trim()
      .max(35)
      .optional()
      .describe('Preferred response language as an Accept-Language value (e.g. "en", "de-DE")'),
  })
  .strip();

export const nominatimOsmSchemas: Record<string, ZodSchema> = {
  'nominatim-osm.search': search,
  'nominatim-osm.reverse': reverse,
  'nominatim-osm.lookup': lookup,
};
