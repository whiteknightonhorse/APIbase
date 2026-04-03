import { z, type ZodSchema } from 'zod';

const geoParams = {
  state_fips: z
    .string()
    .min(1)
    .max(2)
    .describe('US state FIPS code (e.g. 06 for California, 36 for New York, * for all states)'),
  county_fips: z
    .string()
    .optional()
    .describe(
      'County FIPS code within the state (e.g. 037 for Los Angeles, * for all counties). Omit for state-level data.',
    ),
  year: z
    .number()
    .int()
    .min(2010)
    .max(2023)
    .optional()
    .describe('Survey year (default 2022). ACS 5-year estimates available 2010-2022.'),
};

const population = z.object(geoParams).strip();
const demographics = z.object(geoParams).strip();
const economic = z.object(geoParams).strip();
const housing = z.object(geoParams).strip();

export const censusSchemas: Record<string, ZodSchema> = {
  'census.population': population,
  'census.demographics': demographics,
  'census.economic': economic,
  'census.housing': housing,
};
