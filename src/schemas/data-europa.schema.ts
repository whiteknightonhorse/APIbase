import { z, type ZodSchema } from 'zod';

const DATA_THEMES = [
  'AGRI',
  'ECON',
  'EDUC',
  'ENER',
  'ENVI',
  'GOVE',
  'HEAL',
  'INTR',
  'JUST',
  'OP_DATPRO',
  'REGI',
  'SOCI',
  'TECH',
  'TRAN',
] as const;

const datasetSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Free-text search across dataset title/description (e.g. "air quality")'),
    country: z
      .string()
      .length(2)
      .optional()
      .describe('2-letter lowercase ISO country code to filter by (e.g. "de", "fr", "it", "es")'),
    theme: z
      .enum(DATA_THEMES)
      .optional()
      .describe(
        'DCAT-AP data theme code to filter by (e.g. "ENVI" for Environment, "HEAL" for Health) — see data-europa.theme_list for the full list',
      ),
    locale: z
      .string()
      .length(2)
      .optional()
      .describe('2-letter language code for localized fields (default "en")'),
    limit: z
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
      .describe(
        'data.europa.eu dataset id (from dataset_search results, e.g. "f431cf05-276e-4741-ab6e-96ce8b8c5f66")',
      ),
    locale: z
      .string()
      .length(2)
      .optional()
      .describe('2-letter language code for localized fields where available (default "en")'),
  })
  .strip();

const themeList = z
  .object({
    locale: z
      .string()
      .length(2)
      .optional()
      .describe('2-letter language code for theme labels (default "en")'),
  })
  .strip();

const catalogueList = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Substring filter on catalogue id (e.g. "geo" matches "geocat-li", "gdi-de")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(211)
      .optional()
      .describe('Max catalogues to return (1-211, default 50)'),
  })
  .strip();

export const dataEuropaSchemas: Record<string, ZodSchema> = {
  'data-europa.dataset_search': datasetSearch,
  'data-europa.dataset_detail': datasetDetail,
  'data-europa.theme_list': themeList,
  'data-europa.catalogue_list': catalogueList,
};
