import { z, type ZodSchema } from 'zod';

export const mygeneSchemas: Record<string, ZodSchema> = {
  'mygene.search': z
    .object({
      q: z
        .string()
        .min(1)
        .describe(
          'Gene query string. Supports full-text search by gene symbol (e.g. "BRCA1"), gene name (e.g. "breast cancer 1"), keyword (e.g. "kinase"), GO term ID (e.g. "GO:0006915"), or Entrez Gene ID (e.g. "1017"). Wildcards supported: "CDK*" matches CDK1, CDK2, etc.',
        ),
      species: z
        .string()
        .optional()
        .default('human')
        .describe(
          'Filter by species. Common values: "human" (Homo sapiens, taxid 9606), "mouse" (Mus musculus, taxid 10090), "rat" (Rattus norvegicus), "fruitfly" (Drosophila melanogaster), "zebrafish" (Danio rerio). Can also use NCBI taxid directly (e.g. "9606"). Use "all" to search across all species.',
        ),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated fields to return per hit. Default: symbol,name,taxid,entrezgene,type_of_gene,summary. Other useful fields: ensembl.gene, uniprot, alias, genomic_pos, go, pathway. Use "all" for every available field.',
        ),
      size: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of gene results to return (1–50, default 10).'),
    })
    .strip(),

  'mygene.gene_info': z
    .object({
      gene_id: z
        .string()
        .min(1)
        .describe(
          'Gene identifier — NCBI Entrez Gene ID (e.g. "1017" for CDK2, "672" for BRCA1) or Ensembl gene ID (e.g. "ENSG00000123374"). Obtain Entrez Gene IDs from mygene.search or mygene.query_by_symbol results.',
        ),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated fields to return. Default includes: symbol, name, taxid, entrezgene, type_of_gene, summary, ensembl, uniprot, alias, genomic_pos, pathway. Use "all" to fetch every available annotation (includes GO terms, RefSeq, PDB, OMIM, etc.).',
        ),
    })
    .strip(),

  'mygene.batch_genes': z
    .object({
      ids: z
        .string()
        .min(1)
        .describe(
          'Comma-separated list of NCBI Entrez Gene IDs or Ensembl gene IDs to retrieve in one request (e.g. "1017,1018,1019" for CDK2/CDK3/CDK4, or "ENSG00000123374,ENSG00000012048"). Maximum 1000 IDs per call.',
        ),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated fields to return for each gene. Default: symbol, name, taxid, entrezgene, type_of_gene, summary, ensembl, uniprot, alias, genomic_pos, pathway. Limit fields to reduce response size for large batches.',
        ),
    })
    .strip(),

  'mygene.query_by_symbol': z
    .object({
      symbol: z
        .string()
        .min(1)
        .describe(
          'Official HGNC gene symbol (for human) or equivalent gene symbol in the target species. Case-insensitive (e.g. "BRCA1", "TP53", "EGFR", "KRAS"). Performs an exact symbol match and returns the single best-matching gene.',
        ),
      species: z
        .string()
        .optional()
        .default('human')
        .describe(
          'Target species for the symbol lookup. Common values: "human", "mouse", "rat", "fruitfly", "zebrafish", "chicken", "pig", "dog". Can also use NCBI taxid (e.g. "9606" for human). Defaults to "human".',
        ),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated fields to include in the response. Default includes: symbol, name, taxid, entrezgene, type_of_gene, summary, ensembl, uniprot, alias, genomic_pos, pathway. Use "all" for complete gene annotations.',
        ),
    })
    .strip(),
};
