import { z } from 'zod';

export const echoSchemas: Record<string, z.ZodTypeAny> = {
  'echo.facility_search': z
    .object({
      zip_code: z
        .string()
        .optional()
        .describe(
          'US ZIP code to search within (e.g. "94601"). Recommended for precise results. Provide either zip_code or facility_name.',
        ),
      facility_name: z
        .string()
        .optional()
        .describe(
          'Partial or full facility name to search for (e.g. "Chevron"). Use with state for best results.',
        ),
      state: z
        .string()
        .length(2)
        .optional()
        .describe(
          'Two-letter US state code to narrow results (e.g. "CA", "TX"). Required when using facility_name without zip_code.',
        ),
      active_only: z
        .boolean()
        .optional()
        .default(true)
        .describe('Return only currently active regulated facilities. Default true.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of facilities to return (1–50). Default 10.'),
    })
    .strip(),

  'echo.facility_detail': z
    .object({
      registry_id: z
        .string()
        .describe(
          'EPA Facility Registry System (FRS) Registry ID for the facility (e.g. "110000350226"). Obtained from echo.facility_search results.',
        ),
    })
    .strip(),

  'echo.air_facilities': z
    .object({
      zip_code: z
        .string()
        .optional()
        .describe(
          'US ZIP code to search within (e.g. "77002"). Recommended for precise results. Provide either zip_code or facility_name.',
        ),
      facility_name: z
        .string()
        .optional()
        .describe(
          'Partial or full facility name to search for (e.g. "Exxon"). Use with state for best results.',
        ),
      state: z
        .string()
        .length(2)
        .optional()
        .describe(
          'Two-letter US state code to narrow results (e.g. "TX", "OH"). Required when using facility_name without zip_code.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of facilities to return (1–50). Default 10.'),
    })
    .strip(),

  'echo.violations': z
    .object({
      registry_id: z
        .string()
        .describe(
          'EPA Facility Registry System (FRS) Registry ID to retrieve enforcement and violation history for (e.g. "110000350226"). Obtained from echo.facility_search results.',
        ),
    })
    .strip(),
};
