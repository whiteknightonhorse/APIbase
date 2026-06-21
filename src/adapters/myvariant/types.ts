/**
 * MyVariant.info API response types (UC-480).
 */

export interface MyVariantQueryHit {
  _id: string;
  _score?: number;
  chrom?: string;
  hg19?: { start?: number; end?: number };
  hg38?: { start?: number; end?: number };
  dbsnp?: {
    rsid?: string;
    vartype?: string;
    alleles?: Array<{ allele: string; freq?: Record<string, number> }>;
    ref?: string;
    alt?: string;
  };
  clinvar?: {
    rsid?: number;
    rcv?: Array<{
      accession?: string;
      clinical_significance?: string;
      conditions?: { name?: string | string[] };
    }>;
    gene?: { id?: number; symbol?: string };
    type?: string;
    hgvs?: { coding?: string; genomic?: string | string[] };
  };
  cadd?: {
    phred?: number;
    rawscore?: number;
    consequence?: string;
    type?: string;
  };
  gnomad_exome?: {
    af?: { af?: number; af_afr?: number; af_eur?: number; af_asj?: number; af_eas?: number };
    ac?: { ac?: number };
    an?: { an?: number };
  };
  gnomad_genome?: {
    af?: { af?: number; af_afr?: number; af_eur?: number; af_eas?: number };
    ac?: { ac?: number };
    an?: { an?: number };
  };
  snpeff?: {
    ann?:
      | Array<{
          effect?: string;
          feature_id?: string;
          gene_id?: string;
          putative_impact?: string;
          hgvs_c?: string;
          hgvs_p?: string;
        }>
      | {
          effect?: string;
          feature_id?: string;
          gene_id?: string;
          putative_impact?: string;
          hgvs_c?: string;
          hgvs_p?: string;
        };
  };
  vcf?: { ref?: string; alt?: string; position?: string };
  observed?: boolean;
}

export interface MyVariantQueryResult {
  took?: number;
  total: number;
  max_score?: number;
  hits: MyVariantQueryHit[];
}

export interface MyVariantMetadata {
  biothing_type?: string;
  build_version?: string;
  build_date?: string;
  stats?: Record<string, number>;
  src?: Record<string, unknown>;
}
