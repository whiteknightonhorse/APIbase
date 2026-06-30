import { z, type ZodSchema } from 'zod';

const proteinSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Protein or gene search term — e.g. "insulin", "hemoglobin", "BRCA1". ' +
          'Supports UniProt query syntax: field:value pairs (e.g. "protein_name:kinase")',
      ),
    organism_id: z
      .number()
      .int()
      .optional()
      .describe(
        'NCBI taxonomy ID to filter by organism. Common IDs: 9606 (human), 10090 (mouse), ' +
          '10116 (rat), 7227 (fruit fly), 6239 (C. elegans), 3702 (A. thaliana)',
      ),
    gene: z
      .string()
      .optional()
      .describe(
        'Gene name filter (exact or partial). E.g. "TP53", "EGFR", "BRAC1". ' +
          'Combined with query using AND logic',
      ),
    reviewed: z
      .boolean()
      .optional()
      .describe(
        'If true, restrict to Swiss-Prot (manually reviewed) entries only. ' +
          'Swiss-Prot has higher quality annotations than TrEMBL (unreviewed)',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results to return (1–25, default 5)'),
  })
  .strip();

const proteinEntry = z
  .object({
    accession: z
      .string()
      .min(1)
      .describe(
        'UniProt accession number (e.g. "P69905" for hemoglobin alpha, "P01308" for insulin, ' +
          '"P53_HUMAN" entry name also accepted). Six or ten character alphanumeric code',
      ),
  })
  .strip();

const proteinFeatures = z
  .object({
    accession: z
      .string()
      .min(1)
      .describe(
        'UniProt accession number to retrieve sequence features for ' +
          '(e.g. "P69905", "P01308"). Returns active sites, domains, signal peptides, ' +
          'transmembrane regions, disulfide bonds, variants, and secondary structure',
      ),
  })
  .strip();

const taxonomy = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Organism or taxonomic name to search — e.g. "human", "Homo sapiens", ' +
          '"Mus musculus", "bacteria", "fungi". Returns taxonomy ID, lineage, and protein counts',
      ),
    rank: z
      .enum(['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'])
      .optional()
      .describe('Filter by taxonomic rank (e.g. "species" to exclude higher-level taxa)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of taxonomy results (1–20, default 5)'),
  })
  .strip();

export const uniprotSchemas: Record<string, ZodSchema> = {
  'uniprot.protein_search': proteinSearch,
  'uniprot.protein_entry': proteinEntry,
  'uniprot.protein_features': proteinFeatures,
  'uniprot.taxonomy': taxonomy,
};
