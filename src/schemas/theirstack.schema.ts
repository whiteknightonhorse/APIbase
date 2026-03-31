import { z, type ZodSchema } from 'zod';

const jobs = z
  .object({
    keywords: z
      .string()
      .optional()
      .describe(
        'Comma-separated job title keywords (e.g. "python developer, backend engineer"). Matches job_title_or filter',
      ),
    country: z
      .string()
      .optional()
      .describe('ISO 3166-1 alpha-2 country code (e.g. "US", "DE", "IN")'),
    remote: z.boolean().optional().describe('Filter remote-only jobs'),
    days: z
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .describe('Max age in days (1-90). Only jobs posted within this window'),
    technologies: z
      .string()
      .optional()
      .describe(
        'Comma-separated tech stack filter (e.g. "kubernetes, python, react"). Matches technologies_or',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .default(10)
      .describe('Max results (1-25, default 10)'),
  })
  .strip();

const companies = z
  .object({
    technologies: z
      .string()
      .optional()
      .describe(
        'Comma-separated tech stack filter (e.g. "kubernetes, docker, aws"). Find companies using these technologies',
      ),
    country: z
      .string()
      .optional()
      .describe('ISO 3166-1 alpha-2 country code (e.g. "US", "DE", "IN")'),
    min_jobs: z.number().int().min(1).optional().describe('Minimum number of active job postings'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .default(10)
      .describe('Max results (1-25, default 10)'),
  })
  .strip();

export const theirstackSchemas: Record<string, ZodSchema> = {
  'theirstack.jobs': jobs,
  'theirstack.companies': companies,
};
