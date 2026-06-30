import { z, type ZodSchema } from 'zod';

const projectSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Keyword(s) to search in project titles (e.g. "artificial intelligence", "climate change", "renewable energy")',
      ),
    status: z
      .enum(['SIGNED', 'CLOSED', 'TERMINATED'])
      .optional()
      .describe(
        'Project lifecycle status filter. SIGNED = active/running, CLOSED = completed, TERMINATED = cancelled early.',
      ),
    year_from: z
      .number()
      .int()
      .min(1984)
      .max(2030)
      .optional()
      .describe(
        'Filter projects starting on or after this year (e.g. 2020 for Horizon Europe era)',
      ),
    year_to: z
      .number()
      .int()
      .min(1984)
      .max(2035)
      .optional()
      .describe('Filter projects starting on or before this year (e.g. 2027)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Maximum number of results to return (1-20, default 10)'),
  })
  .strip();

const projectDetails = z
  .object({
    grant_id: z
      .string()
      .min(6)
      .describe(
        'Grant agreement number — typically 9 digits for Horizon Europe (e.g. "101181585") or 6 digits for H2020 (e.g. "101004410"). Found in cordis.project_search results as the `id` field.',
      ),
  })
  .strip();

const organisationSearch = z
  .object({
    name: z
      .string()
      .min(2)
      .describe(
        'Organisation name fragment to search (case-insensitive). E.g. "university of cambridge", "fraunhofer", "CERN".',
      ),
    country: z
      .string()
      .length(2)
      .optional()
      .describe(
        'ISO 3166-1 alpha-2 country code to filter by (e.g. "DE" for Germany, "FR" for France, "GB" for UK)',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Maximum number of results (1-20, default 10)'),
  })
  .strip();

const projectPublications = z
  .object({
    query: z
      .string()
      .min(2)
      .describe(
        'Keyword(s) to search in publication titles (e.g. "machine learning", "cancer therapy", "battery storage")',
      ),
    project_id: z
      .string()
      .optional()
      .describe(
        'Optional grant agreement number to scope publications to a specific EU project (e.g. "101181585")',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Maximum number of publications to return (1-20, default 10)'),
  })
  .strip();

export const cordisSchemas: Record<string, ZodSchema> = {
  'cordis.project_search': projectSearch,
  'cordis.project_details': projectDetails,
  'cordis.organisation_search': organisationSearch,
  'cordis.project_publications': projectPublications,
};
