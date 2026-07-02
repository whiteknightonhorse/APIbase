// OBIS (Ocean Biodiversity Information System) API types — UC-576

export interface ObisOccurrenceRecord {
  id: string;
  occurrenceID: string;
  scientificName: string;
  species: string;
  genus: string;
  family: string;
  order: string;
  class: string;
  phylum: string;
  kingdom: string;
  aphiaID: number;
  decimalLatitude: number | null;
  decimalLongitude: number | null;
  date_year: number | null;
  month: number | null;
  datasetName: string;
  basisOfRecord: string;
  marine: boolean;
  depth: number | null;
  sst: number | null;
}

export interface ObisOccurrenceResponse {
  total: number;
  results: ObisOccurrenceRecord[];
}

export interface ObisTaxonRecord {
  scientificName: string;
  scientificNameAuthorship: string;
  taxonID: number;
  taxonRank: string;
  taxonomicStatus: string;
  acceptedNameUsage: string;
  acceptedNameUsageID: number;
  is_marine: boolean;
  is_brackish: boolean;
  is_freshwater: boolean;
  kingdom: string;
  phylum: string;
  class: string;
  order: string;
  family: string;
  genus: string;
  species: string;
  vernacularNames: Array<{ language: string; vernacularName: string }>;
}

export interface ObisTaxonResponse {
  total: number;
  results: ObisTaxonRecord[];
}

export interface ObisChecklistRecord {
  scientificName: string;
  taxonID: number;
  taxonRank: string;
  kingdom: string;
  phylum: string;
  class: string;
  order: string;
  family: string;
  genus: string;
  species: string;
  records: number;
  is_marine: boolean;
}

export interface ObisChecklistResponse {
  total: number;
  results: ObisChecklistRecord[];
}

export interface ObisDatasetRecord {
  id: string;
  title: string;
  abstract: string;
  records: number;
  citation: string;
  url: string;
}

export interface ObisDatasetResponse {
  total: number;
  results: ObisDatasetRecord[];
}

// Normalized output types
export interface ObisOccurrenceOutput {
  total: number;
  results: Array<{
    occurrence_id: string;
    scientific_name: string;
    species: string;
    genus: string;
    family: string;
    order: string;
    class: string;
    phylum: string;
    kingdom: string;
    aphia_id: number;
    latitude: number | null;
    longitude: number | null;
    year: number | null;
    month: number | null;
    dataset: string;
    basis_of_record: string;
    depth_m: number | null;
    sea_surface_temp_c: number | null;
  }>;
}

export interface ObisTaxonOutput {
  total: number;
  results: Array<{
    scientific_name: string;
    authorship: string;
    aphia_id: number;
    rank: string;
    status: string;
    accepted_name: string;
    is_marine: boolean;
    is_brackish: boolean;
    is_freshwater: boolean;
    kingdom: string;
    phylum: string;
    class: string;
    order: string;
    family: string;
    genus: string;
    species: string;
    vernacular_names: string[];
  }>;
}

export interface ObisChecklistOutput {
  total: number;
  results: Array<{
    scientific_name: string;
    aphia_id: number;
    rank: string;
    kingdom: string;
    phylum: string;
    class: string;
    order: string;
    family: string;
    genus: string;
    species: string;
    occurrence_records: number;
    is_marine: boolean;
  }>;
}

export interface ObisDatasetOutput {
  total: number;
  results: Array<{
    id: string;
    title: string;
    abstract: string;
    records: number;
    citation: string;
    url: string;
  }>;
}
