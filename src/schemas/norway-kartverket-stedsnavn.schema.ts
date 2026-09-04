import { z, type ZodSchema } from 'zod';

const searchNames = z
  .object({
    query: z.string().min(1).describe('Place name text to search for, e.g. "Oslo" or "Bergen"'),
    county: z
      .string()
      .optional()
      .describe('Filter results to a Norwegian county name (fylkesnavn), e.g. "Viken"'),
    municipality: z
      .string()
      .optional()
      .describe('Filter results to a Norwegian municipality name (kommunenavn), e.g. "Bergen"'),
    fuzzy: z
      .boolean()
      .optional()
      .describe('Allow fuzzy/approximate text matching instead of exact substring search'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Maximum results to return (default 10, max 30)'),
  })
  .strip()
  .describe(
    'Search the Norwegian official place name register (Kartverket Stedsnavn) by text, ' +
      'optionally filtered by county or municipality',
  );

const searchByPoint = z
  .object({
    lat: z
      .number()
      .min(57)
      .max(72)
      .describe('Decimal degree latitude (WGS84/EUREF89) within Norway, e.g. 59.91273 for Oslo'),
    lng: z
      .number()
      .min(4)
      .max(32)
      .describe('Decimal degree longitude (WGS84/EUREF89) within Norway, e.g. 10.74609 for Oslo'),
    radius_m: z
      .number()
      .min(10)
      .max(10000)
      .optional()
      .describe('Search radius in metres around lat/lng (default 500, max 10000)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Maximum place names to return (default 10, max 30)'),
  })
  .strip()
  .describe(
    'Find Norwegian place names near a geographic coordinate (reverse lookup), from the ' +
      'Kartverket Stedsnavn register',
  );

const getPlace = z
  .object({
    place_id: z
      .union([z.number().int(), z.string().min(1)])
      .describe(
        'Norwegian place id (stedsnummer) to look up, e.g. 307915 for Oslo — from ' +
          'search_names or search_by_point results',
      ),
  })
  .strip()
  .describe(
    'Get the full record for a single Norwegian place by its stedsnummer id, including all ' +
      'written name forms, status, location and geometry',
  );

export const norwayKartverketStedsnavnSchemas: Record<string, ZodSchema> = {
  'norway-kartverket-stedsnavn.search_names': searchNames,
  'norway-kartverket-stedsnavn.search_by_point': searchByPoint,
  'norway-kartverket-stedsnavn.get_place': getPlace,
};
