import { z, type ZodSchema } from 'zod';

const vesselSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Vessel name, MMSI (9-digit AIS identifier), IMO number, or call sign to search for ' +
          '(e.g. "Atlantic Star", "123456789", "IMO9234567"). Partial names are supported.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of vessels to return (1–50, default 10).'),
    flag: z
      .string()
      .length(3)
      .optional()
      .describe(
        'ISO 3166-1 alpha-3 country code to filter by flag state (e.g. "CHN" for China, ' +
          '"USA" for United States, "PAN" for Panama).',
      ),
  })
  .strip();

const vesselDetails = z
  .object({
    vessel_id: z
      .string()
      .min(1)
      .describe(
        'Global Fishing Watch vessel UUID as returned by gfw.vessel.search ' +
          '(e.g. "1f1f12b24-4dfb-e5c8-90b0-32f8e79402c1").',
      ),
  })
  .strip();

const fishingEvents = z
  .object({
    vessel_id: z
      .string()
      .min(1)
      .describe(
        'GFW vessel UUID as returned by gfw.vessel.search ' +
          '(e.g. "1f1f12b24-4dfb-e5c8-90b0-32f8e79402c1").',
      ),
    event_type: z
      .enum(['fishing', 'port_visit'])
      .optional()
      .describe(
        'Type of maritime event to retrieve. "fishing" returns AIS-detected fishing activity ' +
          'events; "port_visit" returns port calls and anchorage stops. Default: "fishing".',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of events per page (1–50, default 10).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset — number of events to skip (default 0).'),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Filter events starting on or after this date in ISO format YYYY-MM-DD (e.g. "2023-01-01").',
      ),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Filter events ending on or before this date in ISO format YYYY-MM-DD (e.g. "2023-12-31").',
      ),
  })
  .strip();

const fishingEffort = z
  .object({
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe(
        'Start of the analysis period in ISO format YYYY-MM-DD (e.g. "2023-01-01"). ' +
          'GFW data coverage starts from 2012.',
      ),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe(
        'End of the analysis period in ISO format YYYY-MM-DD (e.g. "2023-06-30"). ' +
          'Must be after start_date; keep ranges under 12 months for manageable response sizes.',
      ),
    coordinates: z
      .array(z.tuple([z.number(), z.number()]))
      .min(4)
      .optional()
      .describe(
        'Polygon boundary as an array of [longitude, latitude] pairs defining the analysis area. ' +
          'The polygon must be closed (first and last coordinate identical). ' +
          'Example: [[-10,35],[-5,35],[-5,40],[-10,40],[-10,35]] for a box in the NE Atlantic. ' +
          'Omit to analyze global waters.',
      ),
    temporal_resolution: z
      .enum(['MONTHLY', 'YEARLY'])
      .optional()
      .describe(
        'Time granularity for effort aggregation. "MONTHLY" groups data by calendar month; ' +
          '"YEARLY" by year. Default: "MONTHLY".',
      ),
  })
  .strip();

export const gfwSchemas: Record<string, ZodSchema> = {
  'gfw.vessel.search': vesselSearch,
  'gfw.vessel.details': vesselDetails,
  'gfw.vessel.fishing_events': fishingEvents,
  'gfw.ocean.fishing_effort': fishingEffort,
};
