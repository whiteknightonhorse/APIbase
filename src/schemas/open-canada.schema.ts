import { z, type ZodSchema } from 'zod';

const datasetSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Free-text search across dataset title/description (e.g. "climate normals")'),
    subject: z
      .string()
      .optional()
      .describe(
        'Topic slug to filter by (e.g. "health_and_safety", "nature_and_environment") — see open-canada.subject_list',
      ),
    organization: z
      .string()
      .optional()
      .describe(
        'Federal department/agency slug to filter by (e.g. "nrcan-rncan") — see open-canada.organization_list',
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
      .describe('Open Canada dataset UUID or URL slug (e.g. from dataset_search results)'),
  })
  .strip();

const subjectList = z
  .object({
    query: z.string().optional().describe('Substring filter on subject slug (e.g. "health")'),
  })
  .strip();

const organizationList = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Substring filter on organization title (e.g. "natural resources")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max organizations to return (1-50, default 20)'),
  })
  .strip();

export const openCanadaSchemas: Record<string, ZodSchema> = {
  'open-canada.dataset_search': datasetSearch,
  'open-canada.dataset_detail': datasetDetail,
  'open-canada.subject_list': subjectList,
  'open-canada.organization_list': organizationList,
};
