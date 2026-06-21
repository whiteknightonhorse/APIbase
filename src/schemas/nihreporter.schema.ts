import { z, type ZodSchema } from 'zod';

const projectsSearch = z
  .object({
    keyword: z
      .string()
      .describe(
        'Research topic, disease, drug name, or technique to search (e.g. "mRNA cancer vaccine", "Alzheimer amyloid", "CRISPR")',
      ),
    fiscal_year: z
      .number()
      .int()
      .min(1985)
      .max(2030)
      .optional()
      .describe('Fiscal year to filter results (e.g. 2024). NIH fiscal year runs Oct 1 – Sep 30'),
    agency: z
      .string()
      .optional()
      .describe(
        'NIH institute or agency code to filter by (e.g. "NCI" for cancer, "NIDDK" for diabetes, "NIMH" for mental health, "NIAID" for infectious disease)',
      ),
    is_active: z
      .boolean()
      .optional()
      .describe('When true, return only currently active/ongoing projects'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results to return (1–25, default 10)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset — number of results to skip (default 0)'),
  })
  .strip();

const projectsByOrg = z
  .object({
    org_name: z
      .string()
      .describe(
        'Institution or university name to search (e.g. "JOHNS HOPKINS UNIVERSITY", "HARVARD UNIVERSITY", "MAYO CLINIC"). Partial uppercase match.',
      ),
    fiscal_year: z
      .number()
      .int()
      .min(1985)
      .max(2030)
      .optional()
      .describe('Fiscal year to filter (e.g. 2024). NIH fiscal year runs Oct 1 – Sep 30'),
    is_active: z
      .boolean()
      .optional()
      .describe('When true, return only currently active/ongoing projects'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results to return (1–25, default 10)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset — number of results to skip (default 0)'),
  })
  .strip();

const projectsByPi = z
  .object({
    last_name: z
      .string()
      .describe(
        'Principal investigator last name (e.g. "BHATT", "FAUCI", "COLLINS"). Case-insensitive, automatically uppercased.',
      ),
    first_name: z
      .string()
      .optional()
      .describe(
        'Principal investigator first name for disambiguation (optional, automatically uppercased)',
      ),
    fiscal_year: z
      .number()
      .int()
      .min(1985)
      .max(2030)
      .optional()
      .describe('Fiscal year to filter (e.g. 2024). NIH fiscal year runs Oct 1 – Sep 30'),
    is_active: z
      .boolean()
      .optional()
      .describe('When true, return only currently active/ongoing projects'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results to return (1–25, default 10)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset — number of results to skip (default 0)'),
  })
  .strip();

const publicationsByProject = z
  .object({
    core_project_num: z
      .string()
      .describe(
        'NIH core project number (e.g. "R01CA123456", "U54GM115371"). Returned as core_project_num in projects.search results.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of publication PMIDs to return (1–100, default 50)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset — number of results to skip (default 0)'),
  })
  .strip();

export const nihreporterSchemas: Record<string, ZodSchema> = {
  'nihreporter.projects.search': projectsSearch,
  'nihreporter.projects.by_org': projectsByOrg,
  'nihreporter.projects.by_pi': projectsByPi,
  'nihreporter.publications.by_project': publicationsByProject,
};
