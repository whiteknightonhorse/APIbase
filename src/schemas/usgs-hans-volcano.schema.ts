import { z } from 'zod';

/**
 * USGS HANS Volcano schemas (UC-556).
 * Every field has .describe() to satisfy Smithery param-description check.
 */
export const usgsHansVolcanoSchemas: Record<string, z.ZodSchema> = {
  'volcano.monitored': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Maximum number of monitored volcanoes to return (1–200, default all ~69)'),
    })
    .strip(),

  'volcano.elevated': z
    .object({
      color_code: z
        .enum(['YELLOW', 'ORANGE', 'RED'])
        .optional()
        .describe(
          'Filter by aviation color code: YELLOW (advisory), ORANGE (watch), RED (warning)',
        ),
    })
    .strip(),

  'volcano.cap_alerts': z
    .object({
      min_alert_level: z
        .enum(['ADVISORY', 'WATCH', 'WARNING'])
        .optional()
        .describe(
          'Minimum alert level to include: ADVISORY, WATCH, or WARNING (default: all elevated)',
        ),
    })
    .strip(),

  'volcano.us_catalog': z
    .object({
      region: z
        .string()
        .optional()
        .describe(
          'Filter by region name substring (e.g. "Alaska", "Hawaii", "Cascades", "California")',
        ),
    })
    .strip(),

  'volcano.detail': z
    .object({
      volcano_id: z
        .string()
        .describe(
          'USGS volcano code (e.g. ak277) or Smithsonian volcano number (e.g. 311090). ' +
            'Get IDs from volcano.us_catalog or volcano.monitored.',
        ),
    })
    .strip(),

  'volcano.latest_notice': z
    .object({
      volcano_id: z
        .string()
        .describe(
          'USGS volcano code (e.g. ak277) or Smithsonian volcano number (e.g. 311090). ' +
            'Get IDs from volcano.us_catalog or volcano.monitored.',
        ),
    })
    .strip(),
};
