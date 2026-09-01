import { z, type ZodSchema } from 'zod';

const datasetSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Free-text search across dataset title/description (e.g. "rainfall")'),
    organization: z
      .string()
      .optional()
      .describe(
        'Publishing agency slug to filter by (e.g. "aihw") — see au-data-gov.organization_search',
      ),
    rows: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of datasets to return (1-20, default 10)'),
  })
  .strip();

const datasetDetail = z
  .object({
    id: z
      .string()
      .min(1)
      .describe('au-data-gov dataset UUID or URL slug (e.g. from dataset_search results)'),
  })
  .strip();

const subjectList = z
  .object({
    query: z.string().optional().describe('Substring filter on subject slug (e.g. "health")'),
  })
  .strip();

const organizationSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Free-text search on organization name/title (e.g. "health")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max organizations to return (1-50, default 20)'),
  })
  .strip();

export const auDataGovSchemas: Record<string, ZodSchema> = {
  'au-data-gov.dataset_search': datasetSearch,
  'au-data-gov.dataset_detail': datasetDetail,
  'au-data-gov.subject_list': subjectList,
  'au-data-gov.organization_search': organizationSearch,
};
