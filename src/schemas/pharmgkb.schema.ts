import { z } from 'zod';

export const pharmgkbSchemas: Record<string, z.ZodTypeAny> = {
  'pharmgkb.gene_search': z
    .object({
      symbol: z
        .string()
        .describe(
          'HGNC gene symbol to search for (e.g. CYP2C9, CYP2D6, BRCA1, VKORC1, TPMT). Case-insensitive. Use the official gene symbol as listed by HGNC.',
        ),
    })
    .strip(),

  'pharmgkb.drug_search': z
    .object({
      name: z
        .string()
        .describe(
          'Drug or chemical name to search for (e.g. warfarin, clopidogrel, tamoxifen, codeine). Searches PharmGKB curated database of 3,000+ pharmacologically relevant compounds.',
        ),
    })
    .strip(),

  'pharmgkb.variant_lookup': z
    .object({
      rsid: z
        .string()
        .describe(
          'dbSNP reference SNP ID for the variant (e.g. rs1799853, rs4244285, rs12248560). Must be prefixed with "rs" followed by digits. PharmGKB annotates variants with known pharmacogenomic relevance.',
        ),
    })
    .strip(),

  'pharmgkb.drug_labels': z
    .object({
      source: z
        .enum(['FDA', 'EMA', 'PMDA', 'HCSC', 'SWISSMEDIC', 'AEMPS'])
        .optional()
        .default('FDA')
        .describe(
          'Regulatory authority whose drug label annotations to retrieve. FDA=US Food & Drug Administration (largest set), EMA=European Medicines Agency, PMDA=Japan, HCSC=Canada, SWISSMEDIC=Switzerland, AEMPS=Spain. Defaults to FDA.',
        ),
      dosing_only: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'When true, return only labels that include pharmacogenomics-based dosing information (dosingInformation=true). Useful for finding actionable prescribing guidance.',
        ),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe(
          'Page number for pagination (1-indexed). Each page returns up to 100 results. FDA source has 500+ annotations.',
        ),
    })
    .strip(),
};
