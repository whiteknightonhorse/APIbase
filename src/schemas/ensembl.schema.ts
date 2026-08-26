import { z, type ZodSchema } from 'zod';

const geneLookup = z
  .object({
    species: z
      .string()
      .min(1)
      .describe(
        'Species name in Ensembl format — scientific snake_case (e.g. "homo_sapiens", "mus_musculus") or common alias (e.g. "human", "mouse")',
      ),
    symbol: z.string().min(1).describe('Gene symbol to look up (e.g. "BRCA1", "TP53", "EGFR")'),
    expand: z
      .boolean()
      .optional()
      .default(true)
      .describe('Include the list of transcripts for this gene in the response. Default: true'),
  })
  .strip();

const sequenceRegion = z
  .object({
    species: z
      .string()
      .min(1)
      .describe(
        'Species name in Ensembl format — scientific snake_case (e.g. "homo_sapiens") or common alias (e.g. "human", "mouse")',
      ),
    region: z
      .string()
      .min(1)
      .describe(
        'Genomic region in "chromosome:start-end" format, GRCh38 coordinates (e.g. "X:1000000-1000100", "17:7668402-7687550" for TP53)',
      ),
  })
  .strip();

export const ensemblSchemas: Record<string, ZodSchema> = {
  'ensembl.gene_lookup': geneLookup,
  'ensembl.sequence_region': sequenceRegion,
};
