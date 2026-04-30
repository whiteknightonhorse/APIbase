import { z, type ZodSchema } from 'zod';

const baseQuery = z
  .object({
    country: z
      .string()
      .optional()
      .describe(
        'Eurostat geo code — 2-letter country (DE, FR, IT, ES, UK, PL, ...) or aggregate ("EU27_2020", "EA20"). One country per call. Default: "EU27_2020".',
      ),
    since: z
      .string()
      .optional()
      .describe(
        'Earliest period to return — format depends on series frequency: "2020" (annual), "2024-01" (monthly), "2024Q1" (quarterly).',
      ),
    until: z.string().optional().describe('Latest period to return — same format as `since`.'),
  })
  .strip();

export const eurostatSchemas: Record<string, ZodSchema> = {
  'eurostat.unemployment': baseQuery,
  'eurostat.inflation': baseQuery,
  'eurostat.gdp_growth': baseQuery,
  'eurostat.population': baseQuery,
};
