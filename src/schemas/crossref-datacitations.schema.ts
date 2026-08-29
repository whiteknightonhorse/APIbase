import { z, type ZodSchema } from 'zod';

const datasetCitations = z
  .object({
    dataset_doi: z
      .string()
      .min(1)
      .describe('DOI of the dataset to find citing works for (e.g. "10.1037/t00742-000")'),
    rows: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of citation events to return (1-500, default 20)'),
  })
  .strip();

const articleDatasets = z
  .object({
    article_doi: z
      .string()
      .min(1)
      .describe(
        'DOI of the scholarly work to find cited datasets for (e.g. "10.1016/j.jpeds.2026.114997")',
      ),
    rows: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of citation events to return (1-500, default 20)'),
  })
  .strip();

const recentCitations = z
  .object({
    from_date: z
      .string()
      .optional()
      .describe(
        'Only citation events created on/after this date, YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS (e.g. "2026-01-20")',
      ),
    until_date: z
      .string()
      .optional()
      .describe(
        'Only citation events created on/before this date, YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS (e.g. "2026-01-21")',
      ),
    member_id: z
      .string()
      .optional()
      .describe('Filter to citing works from a specific CrossRef member/publisher ID (e.g. "78")'),
    rows: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of citation events to return (1-500, default 20)'),
  })
  .strip();

export const crossrefDataCitationsSchemas: Record<string, ZodSchema> = {
  'crossref-datacitations.dataset_citations': datasetCitations,
  'crossref-datacitations.article_datasets': articleDatasets,
  'crossref-datacitations.recent_citations': recentCitations,
};
