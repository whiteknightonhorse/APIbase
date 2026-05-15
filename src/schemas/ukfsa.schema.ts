import { z, type ZodSchema } from 'zod';

/**
 * UK Food Standards Agency (FSA) — Food Hygiene Rating Scheme tool schemas (UC-429).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

export const ukfsaSchemas: Record<string, ZodSchema> = {
  'ukfsa.establishment_search': z
    .object({
      name: z
        .string()
        .optional()
        .describe(
          "Business name fragment to search (e.g. 'Tesco', 'Pret', 'Wagamama'). Partial match supported.",
        ),
      address: z
        .string()
        .optional()
        .describe("Address or postcode fragment (e.g. 'SW1A 1AA', 'Manchester', 'Oxford Street')."),
      latitude: z
        .number()
        .optional()
        .describe(
          'WGS84 latitude for location-based search (use with longitude + max_distance_miles).',
        ),
      longitude: z.number().optional().describe('WGS84 longitude for location-based search.'),
      max_distance_miles: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .default(5)
        .describe('Search radius from lat/lon in miles (0-100, default 5).'),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe('Results per page (1-50, default 20).'),
      page_number: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(1)
        .describe('Page number for pagination (1-200, default 1).'),
    })
    .strip(),

  'ukfsa.establishment_details': z
    .object({
      establishment_id: z
        .number()
        .int()
        .positive()
        .describe(
          'FSA establishment ID (positive integer, obtained from establishment_search results).',
        ),
    })
    .strip(),

  'ukfsa.local_authorities': z
    .object({
      _unused: z
        .string()
        .optional()
        .describe('Reserved for future filtering — not currently used.'),
    })
    .strip(),
};
