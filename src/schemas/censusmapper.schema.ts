import { z, type ZodSchema } from 'zod';

const listDatasets = z
  .object({
    query: z
      .string()
      .max(50)
      .optional()
      .describe('Case-insensitive text filter over dataset id and description (e.g. "2021")'),
  })
  .strip();

const data = z
  .object({
    dataset: z
      .string()
      .min(1)
      .max(20)
      .regex(/^[A-Za-z0-9_]+$/)
      .describe('Census dataset id from censusmapper.list_datasets (e.g. "CA21", "CA16", "CA11")'),
    level: z
      .enum(['Regions', 'PR', 'CMA', 'CD', 'CSD', 'CT', 'DA', 'DB'])
      .describe(
        'Geographic aggregation level of the returned rows: Regions (the listed regions themselves), PR, CMA, CD, CSD, CT, DA or DB',
      ),
    regions: z
      .record(z.array(z.string().min(1).max(20)).min(1).max(20))
      .describe(
        'Census regions to query, keyed by level with arrays of region ids (e.g. {"CMA":["35535"]} for Toronto, {"PR":["35"]} for Ontario)',
      ),
    vectors: z
      .array(z.string().regex(/^v_[A-Za-z0-9]+_\d+$/))
      .min(1)
      .max(20)
      .describe(
        'Census vector ids to return (e.g. ["v_CA21_1","v_CA21_6"] = population 2021, 2016)',
      ),
    geo_hierarchy: z
      .boolean()
      .optional()
      .describe('Include the parent geography hierarchy columns in each row (default false)'),
    max_rows: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of rows to return (1-1000, default 200)'),
  })
  .strip();

export const censusmapperSchemas: Record<string, ZodSchema> = {
  'censusmapper.list_datasets': listDatasets,
  'censusmapper.data': data,
};
