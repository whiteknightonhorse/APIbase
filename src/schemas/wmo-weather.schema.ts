import { z, type ZodSchema } from 'zod';

/**
 * WMO World Weather Information Service tool schemas (UC-672).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

const cityIdField = z
  .number()
  .int()
  .positive()
  .describe(
    'WMO city ID, e.g. 219 (Kabul) or 183 (Tokyo). Discover IDs with wmo-weather.city_search.',
  );

export const wmoWeatherSchemas: Record<string, ZodSchema> = {
  'wmo-weather.city_search': z
    .object({
      query: z
        .string()
        .min(2)
        .max(100)
        .describe(
          'City or country name to search for (case-insensitive partial match), e.g. "Tokyo", ' +
            '"Kabul", or "Argentina". Matches against ~2,600 cities in the WMO city directory.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum number of matching cities to return (default 20, max 50).'),
    })
    .strip(),

  'wmo-weather.forecast': z
    .object({
      city_id: cityIdField,
    })
    .strip(),

  'wmo-weather.climate_normals': z
    .object({
      city_id: cityIdField,
    })
    .strip(),
};
