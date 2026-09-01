import { z, type ZodSchema } from 'zod';

const localeField = z
  .enum(['fr', 'nl', 'de', 'en'])
  .optional()
  .describe(
    'Language of the catalog to browse: "fr" (French, default), "nl" (Dutch), "de" (German), ' +
      'or "en" (English). Each view exists as a separate record per locale.',
  );

const limitField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Max number of results to return (1-100). Defaults to 20.');

const offsetField = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('Number of results to skip, for pagination. Defaults to 0.');

// ---------------------------------------------------------------------------
// statbel.list_views
// ---------------------------------------------------------------------------

const statbelListViews = z
  .object({
    locale: localeField,
    search: z
      .string()
      .optional()
      .describe('Case-insensitive substring filter on the view name (e.g. "population density").'),
    limit: limitField,
    offset: offsetField,
  })
  .strip();

// ---------------------------------------------------------------------------
// statbel.view_data
// ---------------------------------------------------------------------------

const statbelViewData = z
  .object({
    view_id: z
      .string()
      .uuid()
      .describe(
        'View UUID from statbel.list_views (e.g. "1be9b77f-4005-4d58-a885-8281b5bbe617"). ' +
          'Already encodes the language — no separate locale param needed.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// statbel.list_datasources
// ---------------------------------------------------------------------------

const statbelListDatasources = z
  .object({
    search: z
      .string()
      .optional()
      .describe('Case-insensitive substring filter on the datasource name or description.'),
    locale: localeField.describe(
      'Only return datasources that support this language (checked against supportedLocales). ' +
        'Optional — omit to return datasources in any language.',
    ),
    limit: limitField,
    offset: offsetField,
  })
  .strip();

// ---------------------------------------------------------------------------
// statbel.datasource_detail
// ---------------------------------------------------------------------------

const statbelDatasourceDetail = z
  .object({
    datasource_id: z
      .string()
      .uuid()
      .describe(
        'Datasource UUID from statbel.list_datasources (e.g. "e957ac31-44a2-4718-8469-10470d3c41d9"). ' +
          'An invalid or unpublished id returns an empty upstream response.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const statbelSchemas: Record<string, ZodSchema> = {
  'statbel.list_views': statbelListViews,
  'statbel.view_data': statbelViewData,
  'statbel.list_datasources': statbelListDatasources,
  'statbel.datasource_detail': statbelDatasourceDetail,
};
