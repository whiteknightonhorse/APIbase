// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface GbifSpeciesResult {
  key: number;
  scientific_name: string;
  canonical_name: string;
  rank: string;
  status: string;
  kingdom: string;
  phylum: string;
  class_name: string;
  order: string;
  family: string;
  genus: string;
}

export interface GbifSpeciesSearchOutput {
  total: number;
  results: GbifSpeciesResult[];
}

export interface GbifSpeciesDetailOutput {
  key: number;
  scientific_name: string;
  canonical_name: string;
  rank: string;
  status: string;
  kingdom: string;
  phylum: string;
  class_name: string;
  order: string;
  family: string;
  genus: string;
  parent_key: number | null;
  accepted_key: number | null;
  num_descendants: number;
  vernacular_names: string[];
}

export interface GbifOccurrenceResult {
  key: number;
  species: string;
  scientific_name: string;
  latitude: number | null;
  longitude: number | null;
  country: string;
  state_province: string;
  year: number | null;
  month: number | null;
  basis_of_record: string;
  institution: string;
  dataset: string;
}

export interface GbifOccurrencesOutput {
  total: number;
  results: GbifOccurrenceResult[];
}

export interface GbifOccurrenceCountOutput {
  taxon_key: number;
  count: number;
}
