import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    keywords: z
      .string()
      .optional()
      .describe('Job search keywords (e.g. "python developer", "data scientist", "nurse")'),
    location: z
      .string()
      .optional()
      .describe('UK location — city, town, or postcode (e.g. "London", "Manchester", "SW1A 1AA")'),
    distance: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Search radius in miles from location (default 10)'),
    salary_min: z.number().optional().describe('Minimum annual salary in GBP (e.g. 30000)'),
    salary_max: z.number().optional().describe('Maximum annual salary in GBP (e.g. 80000)'),
    permanent: z.boolean().optional().describe('Filter permanent positions only'),
    contract: z.boolean().optional().describe('Filter contract positions only'),
    full_time: z.boolean().optional().describe('Filter full-time positions only'),
    part_time: z.boolean().optional().describe('Filter part-time positions only'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(25)
      .describe('Max results (1-100, default 25)'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of results to skip for pagination (must be divisible by limit)'),
  })
  .strip();

const details = z
  .object({
    job_id: z.number().int().describe('Reed job ID (from search results). Example: 56448344'),
  })
  .strip();

export const reedSchemas: Record<string, ZodSchema> = {
  'reed.search': search,
  'reed.details': details,
};
