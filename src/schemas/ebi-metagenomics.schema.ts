import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// ebi-metagenomics.study_search — search MGnify metagenomic studies
// ---------------------------------------------------------------------------

const ebiMetagenomicsStudySearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Free-text search across study name, abstract, and bioproject, e.g. "gut microbiome".',
      ),
    biome_lineage: z
      .string()
      .optional()
      .describe(
        'Filter to studies classified under this biome lineage, e.g. "root:Host-associated:Human" ' +
          'or "root:Environmental:Aquatic:Marine". Get valid lineages from ebi-metagenomics.biome_browse.',
      ),
    page: z.number().int().min(1).optional().describe('Page number, 1-indexed (default 1).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of studies to return per page, 1-25 (default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// ebi-metagenomics.study_detail — full detail for one study
// ---------------------------------------------------------------------------

const ebiMetagenomicsStudyDetail = z
  .object({
    accession: z
      .string()
      .min(1)
      .describe('MGnify study accession, e.g. "MGYS00006862", from ebi-metagenomics.study_search.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// ebi-metagenomics.sample_list — samples belonging to a study
// ---------------------------------------------------------------------------

const ebiMetagenomicsSampleList = z
  .object({
    study_accession: z
      .string()
      .min(1)
      .describe('MGnify study accession, e.g. "MGYS00006862", from ebi-metagenomics.study_search.'),
    page: z.number().int().min(1).optional().describe('Page number, 1-indexed (default 1).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of samples to return per page, 1-50 (default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// ebi-metagenomics.biome_browse — browse the biome classification tree
// ---------------------------------------------------------------------------

const ebiMetagenomicsBiomeBrowse = z
  .object({
    lineage: z
      .string()
      .optional()
      .describe(
        'Biome lineage to browse the descendant subtree of, e.g. "root" (entire tree), ' +
          '"root:Host-associated", or "root:Environmental:Aquatic:Marine". Defaults to "root". ' +
          'Returns the queried biome plus every descendant beneath it, not just immediate children.',
      ),
    page: z.number().int().min(1).optional().describe('Page number, 1-indexed (default 1).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of biomes to return per page, 1-50 (default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const ebiMetagenomicsSchemas: Record<string, ZodSchema> = {
  'ebi-metagenomics.study_search': ebiMetagenomicsStudySearch,
  'ebi-metagenomics.study_detail': ebiMetagenomicsStudyDetail,
  'ebi-metagenomics.sample_list': ebiMetagenomicsSampleList,
  'ebi-metagenomics.biome_browse': ebiMetagenomicsBiomeBrowse,
};
