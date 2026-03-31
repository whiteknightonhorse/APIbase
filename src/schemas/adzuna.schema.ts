import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    what: z
      .string()
      .optional()
      .describe('Job search keywords (e.g. "python developer", "marketing manager", "nurse")'),
    where: z.string().optional().describe('Location (e.g. "new york", "london", "berlin")'),
    country: z
      .string()
      .optional()
      .default('us')
      .describe(
        'Country code: us, gb, au, ca, de, fr, nl, in, br, pl, nz, za, sg, at, ch, it, ru (default us)',
      ),
    category: z
      .string()
      .optional()
      .describe(
        'Job category tag (e.g. "it-jobs", "sales-jobs", "engineering-jobs"). Get tags from adzuna.categories',
      ),
    salary_min: z.number().optional().describe('Minimum salary filter'),
    salary_max: z.number().optional().describe('Maximum salary filter'),
    full_time: z.boolean().optional().describe('Filter full-time jobs only'),
    permanent: z.boolean().optional().describe('Filter permanent jobs only'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(10)
      .describe('Max results (1-20, default 10)'),
    page: z.number().int().min(1).optional().default(1).describe('Page number'),
  })
  .strip();

const categories = z
  .object({
    country: z.string().optional().default('us').describe('Country code (default us)'),
  })
  .strip();

const salary = z
  .object({
    what: z
      .string()
      .optional()
      .describe(
        'Job title or keywords for salary histogram (e.g. "python developer", "data scientist")',
      ),
    where: z.string().optional().describe('Location for salary data'),
    country: z.string().optional().default('us').describe('Country code (default us)'),
  })
  .strip();

export const adzunaSchemas: Record<string, ZodSchema> = {
  'adzuna.search': search,
  'adzuna.categories': categories,
  'adzuna.salary': salary,
};
