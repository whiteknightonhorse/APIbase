import { z, type ZodSchema } from 'zod';

export const onsUkStatsSchemas: Record<string, ZodSchema> = {
  'ons.datasets.list': z
    .object({
      keyword: z
        .string()
        .optional()
        .describe(
          'Optional keyword to filter datasets by title, description, or tags (e.g. "gdp", "inflation", "population", "unemployment").',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum number of datasets to return (1–50, default 20).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Pagination offset — number of datasets to skip (default 0).'),
    })
    .strip(),

  'ons.stats.cpih': z
    .object({
      category: z
        .string()
        .optional()
        .describe(
          'ONS aggregate code for the CPIH category. Default "CP00" (Overall Index). Other examples: "CP01" (Food & beverages), "CP02" (Alcohol & tobacco), "CP04" (Housing & energy), "CP07" (Transport). See /v1/datasets/cpih01/editions/time-series/versions/latest/dimensions/aggregate/options for full list.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(300)
        .optional()
        .describe(
          'Number of most recent time periods to return (1–300, default 60). Data is monthly.',
        ),
    })
    .strip(),

  'ons.stats.gdp': z
    .object({
      sector: z
        .string()
        .optional()
        .describe(
          'ONS SIC sector code for GDP breakdown. Default "A--T" (Total monthly GDP). Examples: "A" (Agriculture), "C" (Manufacturing), "F" (Construction), "G-and-I" (Distribution, Hotels & Restaurants), "B--E" (Production Industries). See ONS API for full list.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(300)
        .optional()
        .describe(
          'Number of most recent months to return (1–300, default 60). Data is monthly (seasonally adjusted index, 2016=100).',
        ),
    })
    .strip(),

  'ons.stats.unemployment': z
    .object({
      activity: z
        .enum(['unemployed', 'in-employment', 'economically-active', 'economically-inactive'])
        .optional()
        .describe(
          'Labour market activity to query. Default "unemployed" (unemployment rate). Options: "in-employment" (employment rate), "economically-active", "economically-inactive".',
        ),
      age_group: z
        .enum(['16+', '16-64', '16-17', '16-24', '18-24', '25-34', '35-49', '50-64', '65+'])
        .optional()
        .describe(
          'Age group filter. Default "16+" (all working-age adults). Examples: "16-24" (youth unemployment), "25-34", "50-64".',
        ),
      sex: z
        .enum(['all-adults', 'men', 'women'])
        .optional()
        .describe('Sex filter. Default "all-adults". Options: "men", "women".'),
      unit: z
        .enum(['rates', 'levels'])
        .optional()
        .describe(
          'Output unit. Default "rates" (percentage rate, e.g. 4.2%). "levels" returns thousands of people.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(300)
        .optional()
        .describe(
          'Number of most recent periods to return (1–300, default 60). Data is three-month rolling average (e.g. "Jan-Mar 2024").',
        ),
    })
    .strip(),

  'ons.stats.population': z
    .object({
      geography: z
        .string()
        .optional()
        .describe(
          'ONS geography code for the area. Default "K04000001" (England and Wales). Other codes: "E92000001" (England), "W92000004" (Wales). Use the ONS geography portal to find codes for specific regions or local authorities.',
        ),
      sex: z
        .enum(['all', 'male', 'female'])
        .optional()
        .describe('Sex breakdown. Default "all" (total population). Options: "male", "female".'),
      age: z
        .string()
        .optional()
        .describe(
          'Age filter. Default "total" (all ages combined). Use a single year of age (e.g. "0", "25", "90") to get population for that age group only.',
        ),
    })
    .strip(),
};
