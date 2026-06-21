import { z, type ZodSchema } from 'zod';

const blockFips = z
  .object({
    latitude: z.number().describe('Latitude of the location (e.g. 38.9072).'),
    longitude: z.number().describe('Longitude of the location (e.g. -77.0369).'),
    census_year: z
      .enum(['2000', '2010', '2020'])
      .optional()
      .describe('Census year for block boundaries: "2000", "2010", or "2020" (default current).'),
  })
  .strip();

const proceedings = z
  .object({
    q: z
      .string()
      .optional()
      .describe(
        'Free-text search query across proceeding descriptions (e.g. "net neutrality", "broadband", "spectrum").',
      ),
    bureau: z
      .string()
      .optional()
      .describe(
        'FCC bureau code to filter by (e.g. "WC" Wireline, "MB" Media, "WTB" Wireless, "OET" Engineering).',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of proceedings to return (default 10, max 25).'),
    sort: z
      .string()
      .optional()
      .describe(
        'Sort field and direction (e.g. "date_proceeding_created,DESC" or "total_filing_count,DESC"). Default: newest first.',
      ),
  })
  .strip();

const filings = z
  .object({
    docket: z
      .string()
      .optional()
      .describe(
        'FCC docket/proceeding number to filter filings by (e.g. "17-108", "22-461", "21-93").',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of filings to return (default 10, max 25).'),
    sort: z
      .string()
      .optional()
      .describe(
        'Sort field and direction (e.g. "date_received,DESC" or "date_disseminated,ASC"). Default: newest received first.',
      ),
  })
  .strip();

const proceedingDetail = z
  .object({
    docket: z
      .string()
      .describe(
        'FCC docket number to look up (e.g. "17-108" for Restoring Internet Freedom, "22-461" for broadband rules).',
      ),
  })
  .strip();

export const fccSchemas: Record<string, ZodSchema> = {
  'fcc.geo.block_fips': blockFips,
  'fcc.regulatory.proceedings': proceedings,
  'fcc.regulatory.filings': filings,
  'fcc.regulatory.proceeding_detail': proceedingDetail,
};
