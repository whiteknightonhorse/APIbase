import { z, type ZodSchema } from 'zod';

const query = z
  .object({
    cube: z
      .string()
      .min(1)
      .describe(
        'Data cube (dataset) name to query, e.g. "acs_yg_total_population_1". Look up names via datausa.reference.cubes.',
      ),
    drilldowns: z
      .array(z.string())
      .min(1)
      .describe(
        'Dimension level names to group the results by, e.g. ["State"] or ["State", "Year"]. Look up available levels for a cube via datausa.reference.cubes.',
      ),
    measures: z
      .array(z.string())
      .min(1)
      .describe(
        'Measure (metric) names to retrieve, e.g. ["Population"]. Look up available measures for a cube via datausa.reference.cubes.',
      ),
    include: z
      .string()
      .optional()
      .describe(
        'Restrict results to specific member keys, formatted "Level:key,key;Level2:key" (e.g. "State:04000US06" for California only, or "Year:2021,2022"). Find member keys via datausa.reference.members.',
      ),
    sort: z
      .string()
      .optional()
      .describe(
        'Sort order as "field" or "field.order" where order is asc/desc, e.g. "Population.desc".',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of result rows to return (default 100, max 1000).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of result rows to skip, for pagination (default 0).'),
  })
  .strip();

const cubes = z
  .object({
    cube: z
      .string()
      .optional()
      .describe(
        'Exact cube name to get full detail for (dimensions, levels, measures). Omit to list all available cubes instead.',
      ),
    topic: z
      .string()
      .optional()
      .describe(
        'When listing cubes: filter by topic, case-insensitive substring match (e.g. "Education", "Diversity"). Ignored when cube is set.',
      ),
    search: z
      .string()
      .optional()
      .describe(
        'When listing cubes: filter by cube name or dataset name, case-insensitive substring match. Ignored when cube is set.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('When listing cubes: maximum number of cubes to return (default 50, max 200).'),
  })
  .strip();

const members = z
  .object({
    cube: z.string().min(1).describe('Data cube (dataset) name, e.g. "acs_yg_total_population_1".'),
    level: z
      .string()
      .min(1)
      .describe('Dimension level name to list members for, e.g. "State" or "County".'),
    search: z
      .string()
      .optional()
      .describe('Filter members by name, case-insensitive substring match (e.g. "cali").'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of members to return.'),
  })
  .strip();

export const dataUsaSchemas: Record<string, ZodSchema> = {
  'data-usa.query': query,
  'data-usa.cubes': cubes,
  'data-usa.members': members,
};
