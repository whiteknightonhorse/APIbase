import { z, type ZodSchema } from 'zod';

export const myvariantSchemas: Record<string, ZodSchema> = {
  'myvariant.search': z
    .object({
      q: z
        .string()
        .min(1)
        .describe(
          'Variant query string. Supports: rsID (e.g. "rs58991260"), gene symbol (e.g. "dbsnp.gene.symbol:BRCA1"), CADD score filter (e.g. "cadd.phred:>20"), ClinVar significance (e.g. "clinvar.rcv.clinical_significance:Pathogenic"), chromosome position (e.g. "chrom:7 AND hg19.start:[140453000 TO 140454000]"), or disease/phenotype keywords (e.g. "clinvar.rcv.conditions.name:breast cancer").',
        ),
      size: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of variant results to return (1–50, default 10).'),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated fields to return per hit. Default: dbsnp,clinvar,cadd,gnomad_exome,gnomad_genome,snpeff,vcf,chrom,hg19. Other useful fields: dbnsfp,cosmic,civic,gwassnps,hg38. Use "all" for every available annotation source.',
        ),
      assembly: z
        .enum(['hg19', 'hg38'])
        .optional()
        .describe(
          'Genome assembly for coordinate fields in results. "hg19" (GRCh37) or "hg38" (GRCh38). Defaults to hg19.',
        ),
    })
    .strip(),

  'myvariant.variant_info': z
    .object({
      variant_id: z
        .string()
        .min(1)
        .describe(
          'Variant identifier — dbSNP rsID (e.g. "rs58991260"), or HGVS genomic notation (e.g. "chr7:g.140453134A>T" — use URL-encoded form when needed). rsIDs are preferred as they are stable across assemblies. Obtain IDs from myvariant.search results.',
        ),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated annotation fields to retrieve. Default: dbsnp,clinvar,cadd,gnomad_exome,gnomad_genome,snpeff,vcf,chrom,hg19. Optional: dbnsfp (functional predictions), cosmic (somatic), civic (clinical), gwassnps (GWAS associations), hg38 (GRCh38 coordinates). Use "all" for complete annotation.',
        ),
    })
    .strip(),

  'myvariant.batch_variants': z
    .object({
      ids: z
        .string()
        .min(1)
        .describe(
          'Comma-separated list of variant identifiers to retrieve in a single request. Accepts dbSNP rsIDs (e.g. "rs58991260,rs671,rs1801133") or HGVS genomic IDs. Mix of rsIDs is supported. Maximum 1000 IDs per call. Returns annotation for each variant including ClinVar significance, CADD score, gnomAD allele frequencies, and functional consequences.',
        ),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated annotation fields to return for each variant. Default: dbsnp,clinvar,cadd,gnomad_exome,gnomad_genome,snpeff,vcf,chrom,hg19. Limit fields for large batches to reduce response size.',
        ),
    })
    .strip(),

  'myvariant.metadata': z
    .object({
      detail: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If true, include full source metadata (download dates, record counts per source, code repository links). If false (default), return only build version, build date, and a list of source names and URLs.',
        ),
    })
    .strip(),
};
