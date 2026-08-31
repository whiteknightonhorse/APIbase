import { z, type ZodSchema } from 'zod';

const TAX_ID_RE = /^\d+$/;

const taxonomySearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Organism name to search NCBI Taxonomy for — scientific (e.g. "Panthera leo") or common name (e.g. "African elephant")',
      ),
    retmax: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of matching TaxIDs to return (1-50, default 20)'),
  })
  .strip();

const taxonomySummary = z
  .object({
    tax_id: z
      .string()
      .regex(TAX_ID_RE, 'must be a numeric NCBI Taxonomy ID')
      .describe(
        'NCBI Taxonomy ID (e.g. "9689" for Panthera leo), from ncbi-eutils.taxonomy_search results',
      ),
  })
  .strip();

const taxonomyLineage = z
  .object({
    tax_id: z
      .string()
      .regex(TAX_ID_RE, 'must be a numeric NCBI Taxonomy ID')
      .describe(
        'NCBI Taxonomy ID (e.g. "9689" for Panthera leo), from ncbi-eutils.taxonomy_search results',
      ),
  })
  .strip();

export const ncbiEutilsSchemas: Record<string, ZodSchema> = {
  'ncbi-eutils.taxonomy_search': taxonomySearch,
  'ncbi-eutils.taxonomy_summary': taxonomySummary,
  'ncbi-eutils.taxonomy_lineage': taxonomyLineage,
};
