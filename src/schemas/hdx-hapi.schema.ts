import { z, type ZodSchema } from 'zod';

const commonFilters = {
  location_code: z
    .string()
    .length(3)
    .optional()
    .describe('ISO3 country code to filter results, e.g. "MLI", "AFG", "SOM"'),
  location_name: z
    .string()
    .optional()
    .describe('Country name to filter results (alternative to location_code), e.g. "Mali"'),
  admin1_name: z
    .string()
    .optional()
    .describe('1st-level subnational admin area name to filter results, e.g. "Kayes"'),
  admin_level: z
    .enum(['0', '1', '2'])
    .optional()
    .describe('Admin granularity of returned rows: 0=national, 1=admin1, 2=admin2'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Maximum rows to return (1-1000, default 100)'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Number of rows to skip, for pagination (default 0)'),
};

const operationalPresence = z
  .object({
    ...commonFilters,
    sector_name: z
      .string()
      .optional()
      .describe('Humanitarian sector name to filter results, e.g. "Health", "Nutrition"'),
    org_name: z
      .string()
      .optional()
      .describe('Responding organization name to filter results, e.g. "UNICEF"'),
  })
  .strip();

const humanitarianNeeds = z
  .object({
    ...commonFilters,
    sector_name: z
      .string()
      .optional()
      .describe('Humanitarian sector name to filter results, e.g. "Health", "Food Security"'),
    population_status: z
      .enum(['AFF', 'INN', 'TGT', 'REA', 'all'])
      .optional()
      .describe(
        'Population status: AFF=affected, INN=in need, TGT=targeted, REA=reached, all=all statuses',
      ),
  })
  .strip();

const baselinePopulation = z
  .object({
    ...commonFilters,
    gender: z
      .enum(['f', 'm', 'x', 'u', 'o', 'all'])
      .optional()
      .describe('Gender code: f=female, m=male, x=non-binary, u=unknown, o=other, all=all'),
    age_range: z
      .string()
      .optional()
      .describe('Age range as "[start]-[end]" (e.g. "0-4", "18-59"), or "all" for all ages'),
  })
  .strip();

const foodSecurity = z
  .object({
    ...commonFilters,
    ipc_phase: z
      .enum(['1', '2', '3', '4', '5', '3+', 'all'])
      .optional()
      .describe(
        'IPC phase classification: 1=minimal, 2=stressed, 3=crisis, 4=emergency, 5=catastrophe, 3+=crisis or worse, all=all phases',
      ),
  })
  .strip();

export const hdxHapiSchemas: Record<string, ZodSchema> = {
  'hdx-hapi.operational_presence': operationalPresence,
  'hdx-hapi.humanitarian_needs': humanitarianNeeds,
  'hdx-hapi.baseline_population': baselinePopulation,
  'hdx-hapi.food_security': foodSecurity,
};
