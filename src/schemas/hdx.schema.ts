import { z, type ZodSchema } from 'zod';

const datasetSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Free-text search across dataset title/description (e.g. "food security")'),
    country: z
      .string()
      .optional()
      .describe('HDX location slug to filter by (e.g. "som" for Somalia, "ukr" for Ukraine)'),
    organization: z
      .string()
      .optional()
      .describe('HDX organization slug to filter by (e.g. "who", "unhcr", "ocha-fts")'),
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
    id: z.string().min(1).describe('HDX dataset id or URL slug (e.g. "hdx-hapi-som")'),
  })
  .strip();

const locationList = z
  .object({
    query: z.string().optional().describe('Substring filter on location name (e.g. "sudan")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Max locations to return (1-100, default 50)'),
  })
  .strip();

const organizationList = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Substring filter on organization title (e.g. "red cross")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max organizations to return (1-50, default 20)'),
  })
  .strip();

export const hdxSchemas: Record<string, ZodSchema> = {
  'hdx.dataset_search': datasetSearch,
  'hdx.dataset_detail': datasetDetail,
  'hdx.location_list': locationList,
  'hdx.organization_list': organizationList,
};
