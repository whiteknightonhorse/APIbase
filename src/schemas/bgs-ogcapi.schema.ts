import { z, type ZodSchema } from 'zod';

const lat = z
  .number()
  .min(-90)
  .max(90)
  .optional()
  .describe(
    'Decimal degree latitude (WGS84) — must be supplied together with lng. Omit both for full Great Britain coverage.',
  );
const lng = z
  .number()
  .min(-180)
  .max(180)
  .optional()
  .describe('Decimal degree longitude (WGS84) — must be supplied together with lat.');

const geologyBedrock = z
  .object({
    lat,
    lng,
    radius_km: z
      .number()
      .min(0.5)
      .max(50)
      .optional()
      .describe('Search radius in kilometres around lat/lng (default 5, max 50)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum bedrock geology units to return (default 20, max 50)'),
  })
  .strip()
  .describe(
    'Bedrock geology (lithology + age) for a point in Great Britain, from the BGS 1:625,000 map',
  );

const earthquakeSearch = z
  .object({
    lat,
    lng,
    radius_km: z
      .number()
      .min(0.5)
      .max(500)
      .optional()
      .describe('Search radius in kilometres around lat/lng (default 50, max 500)'),
    period: z
      .enum(['modern', 'historical'])
      .optional()
      .describe(
        '"modern" = instrument-recorded earthquakes since 1970 (default), "historical" = UK earthquakes before 1970',
      ),
    year: z
      .string()
      .regex(/^\d{4}$/)
      .optional()
      .describe('Filter to a single 4-digit year, e.g. "2020"'),
    min_magnitude: z.number().optional().describe('Minimum local magnitude (ML) to include'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum earthquakes to return (default 20, max 100)'),
  })
  .strip()
  .describe('UK earthquake search by area, year, and magnitude (BGS seismic monitoring)');

const boreholeSearch = z
  .object({
    lat,
    lng,
    radius_km: z
      .number()
      .min(0.5)
      .max(50)
      .optional()
      .describe('Search radius in kilometres around lat/lng (default 5, max 50)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum borehole records to return (default 20, max 100)'),
  })
  .strip()
  .describe(
    'Single Onshore Borehole Index (SOBI) — over 1 million UK borehole/shaft/well site-investigation records',
  );

const landslideSearch = z
  .object({
    lat,
    lng,
    radius_km: z
      .number()
      .min(0.5)
      .max(200)
      .optional()
      .describe('Search radius in kilometres around lat/lng (default 20, max 200)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum landslide records to return (default 20, max 100)'),
  })
  .strip()
  .describe('National Landslide Database — recorded UK landslide events and locations');

export const bgsOgcApiSchemas: Record<string, ZodSchema> = {
  'bgs-ogcapi.geology_bedrock': geologyBedrock,
  'bgs-ogcapi.earthquake_search': earthquakeSearch,
  'bgs-ogcapi.borehole_search': boreholeSearch,
  'bgs-ogcapi.landslide_search': landslideSearch,
};
