import { z, type ZodSchema } from 'zod';

const datasets = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Search keyword (e.g. "covid deaths", "vaccination rates", "chronic disease", "mortality")',
      ),
    category: z
      .string()
      .optional()
      .describe('Dataset category filter (e.g. "NCHS", "COVID-19", "Chronic Disease Indicators")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results (1-50, default 20)'),
  })
  .strip();

const query = z
  .object({
    dataset_id: z
      .string()
      .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/, 'Must be Socrata dataset ID like "9bhg-hcku"')
      .describe(
        'CDC dataset ID in xxxx-xxxx format (e.g. "9bhg-hcku" for COVID deaths). Use cdc.datasets to find IDs.',
      ),
    where: z
      .string()
      .optional()
      .describe(
        'SoQL WHERE clause filter (e.g. "state=\'CA\'", "year > 2020", "age_group=\'65+\'")',
      ),
    select: z
      .string()
      .optional()
      .describe(
        'Columns to return, comma-separated (e.g. "state, year, deaths"). Default: all columns.',
      ),
    order: z
      .string()
      .optional()
      .describe('Sort order (e.g. "year DESC", "deaths DESC"). Default: dataset default order.'),
    group: z
      .string()
      .optional()
      .describe('Group by columns for aggregation (e.g. "state" with select "state, SUM(deaths)")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Max rows to return (1-1000, default 100)'),
  })
  .strip();

export const cdcSchemas: Record<string, ZodSchema> = {
  'cdc.datasets': datasets,
  'cdc.query': query,
};
