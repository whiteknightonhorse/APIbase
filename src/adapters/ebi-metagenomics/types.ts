// EBI Metagenomics / MGnify API v1 (https://www.ebi.ac.uk/metagenomics/api/v1) — JSON:API
// response shapes. Only fields actually consumed by parseResponse() are declared.

export interface MgnifyPagination {
  page: number;
  pages: number;
  count: number;
}

export interface MgnifyRelationshipRef {
  type: string;
  id: string;
}

export interface MgnifyStudyAttributes {
  accession: string;
  'study-name'?: string | null;
  'study-abstract'?: string | null;
  bioproject?: string | null;
  'secondary-accession'?: string | null;
  'centre-name'?: string | null;
  'samples-count'?: number | null;
  'is-private'?: boolean;
  'last-update'?: string | null;
  'public-release-date'?: string | null;
  'data-origination'?: string | null;
}

export interface MgnifyStudyResource {
  type: string;
  id: string;
  attributes: MgnifyStudyAttributes;
  relationships?: {
    biomes?: { data?: MgnifyRelationshipRef[] };
  };
}

export interface MgnifyStudiesListResponse {
  data: MgnifyStudyResource[];
  meta?: { pagination?: MgnifyPagination };
}

export interface MgnifyStudyDetailResponse {
  data: MgnifyStudyResource;
}

export interface MgnifySampleMetadataEntry {
  key: string;
  value: string;
  unit?: string | null;
}

export interface MgnifySampleAttributes {
  accession: string;
  'sample-name'?: string | null;
  'sample-alias'?: string | null;
  'sample-desc'?: string | null;
  biosample?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  'geo-loc-name'?: string | null;
  'collection-date'?: string | null;
  'environment-biome'?: string | null;
  'environment-feature'?: string | null;
  'environment-material'?: string | null;
  'host-tax-id'?: number | string | null;
  species?: string | null;
  'last-update'?: string | null;
  'sample-metadata'?: MgnifySampleMetadataEntry[];
}

export interface MgnifySampleResource {
  type: string;
  id: string;
  attributes: MgnifySampleAttributes;
}

export interface MgnifySamplesListResponse {
  data: MgnifySampleResource[];
  meta?: { pagination?: MgnifyPagination };
}

export interface MgnifyBiomeAttributes {
  lineage: string;
  'biome-name'?: string | null;
  'samples-count'?: number | null;
}

export interface MgnifyBiomeResource {
  type: string;
  id: string;
  attributes: MgnifyBiomeAttributes;
}

export interface MgnifyBiomesListResponse {
  data: MgnifyBiomeResource[];
  meta?: { pagination?: MgnifyPagination };
}
