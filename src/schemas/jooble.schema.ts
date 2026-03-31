import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    keywords: z
      .string()
      .optional()
      .describe('Job search keywords (e.g. "python developer", "marketing manager", "nurse")'),
    location: z
      .string()
      .optional()
      .describe('Location (e.g. "New York", "London", "Berlin", "Remote")'),
    radius: z
      .enum(['0', '4', '8', '16', '26', '40', '80'])
      .optional()
      .describe('Search radius in km from location: 0, 4, 8, 16, 26, 40, or 80'),
    salary: z.number().optional().describe('Minimum salary filter (numeric)'),
    page: z.number().int().min(1).optional().default(1).describe('Page number (default 1)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(10)
      .describe('Max results per page (1-20, default 10)'),
    company_search: z
      .boolean()
      .optional()
      .describe('Set true to search by company name instead of job title'),
  })
  .strip();

export const joobleSchemas: Record<string, ZodSchema> = {
  'jooble.search': search,
};
