import { z, type ZodSchema } from 'zod';

const PLOS_JOURNALS = [
  'PLOS ONE',
  'PLOS Biology',
  'PLOS Medicine',
  'PLOS Genetics',
  'PLOS Computational Biology',
  'PLOS Pathogens',
  'PLOS Neglected Tropical Diseases',
  'PLOS Global Public Health',
  'PLOS Digital Health',
  'PLOS Climate',
  'PLOS Mental Health',
  'PLOS Water',
  'PLOS Sustainability and Transformation',
] as const;

// ---------------------------------------------------------------------------
// plos-search.search — search PLOS open-access research articles
// ---------------------------------------------------------------------------

const plosSearchSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Solr query string, e.g. a free-text term ("malaria vaccine") or a field-scoped query ' +
          '("title:CRISPR" or "author:\\"Jane Doe\\""). Searches across the full open-access PLOS corpus.',
      ),
    journal: z
      .enum(PLOS_JOURNALS)
      .optional()
      .describe('Restrict results to one PLOS journal (e.g. "PLOS ONE", "PLOS Biology").'),
    sort: z
      .enum(['relevance', 'date_desc', 'date_asc'])
      .optional()
      .describe(
        'Result ordering: "relevance" (default), "date_desc" (newest first), "date_asc" (oldest first).',
      ),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of articles to return (1-50, default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// plos-search.article_detail — full detail for a single article by DOI
// ---------------------------------------------------------------------------

const plosSearchArticleDetail = z
  .object({
    doi: z
      .string()
      .min(1)
      .describe(
        'Article DOI, e.g. "10.1371/journal.pone.0004050" (returned as "doi" in plos-search.search results).',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const plosSearchSchemas: Record<string, ZodSchema> = {
  'plos-search.search': plosSearchSearch,
  'plos-search.article_detail': plosSearchArticleDetail,
};
