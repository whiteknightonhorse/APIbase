import { z } from 'zod';

export const eonetSchemas: Record<string, z.ZodTypeAny> = {
  'eonet.events': z
    .object({
      source: z
        .string()
        .optional()
        .describe(
          'Filter events by data source ID (e.g. "GDACS", "IRWIN", "JTWC", "PDC"). Multiple sources separated by commas.',
        ),
      status: z
        .enum(['open', 'closed', 'all'])
        .optional()
        .describe(
          'Event status filter: "open" for ongoing events, "closed" for resolved events, "all" for both. Defaults to "open".',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Maximum number of events to return (1–1000). Defaults to 10.'),
      days: z
        .number()
        .int()
        .min(1)
        .max(9999)
        .optional()
        .describe(
          'Return events from the last N days (1–9999). Overrides start/end when provided.',
        ),
      start: z
        .string()
        .optional()
        .describe('Start date for event filter in ISO 8601 format (YYYY-MM-DD).'),
      end: z
        .string()
        .optional()
        .describe('End date for event filter in ISO 8601 format (YYYY-MM-DD).'),
      category: z
        .string()
        .optional()
        .describe(
          'Filter by event category ID. Available categories: drought, dustHaze, earthquakes, floods, landslides, manmade, seaLakeIce, severeStorms, snow, tempExtremes, volcanoes, waterColor, wildfires.',
        ),
      bbox: z
        .string()
        .optional()
        .describe(
          'Bounding box filter as comma-separated decimal degrees: "minLon,minLat,maxLon,maxLat" (e.g. "-180,-90,180,90" for global). Event must have at least one geometry point within the box.',
        ),
    })
    .strip(),

  'eonet.event_detail': z
    .object({
      id: z
        .string()
        .describe('EONET event ID (e.g. "EONET_20606"). Obtain from the eonet.events.list tool.'),
    })
    .strip(),

  'eonet.categories': z
    .object({
      locale: z
        .string()
        .optional()
        .describe(
          'Reserved for future use. Currently EONET returns English-only category names and descriptions.',
        ),
    })
    .strip(),

  'eonet.layers': z
    .object({
      category_id: z
        .string()
        .describe(
          'Category ID to retrieve GIS web service layers for. Available IDs: drought, dustHaze, earthquakes, floods, landslides, manmade, seaLakeIce, severeStorms, snow, tempExtremes, volcanoes, waterColor, wildfires.',
        ),
    })
    .strip(),
};
