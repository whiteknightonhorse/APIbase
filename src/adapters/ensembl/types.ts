/**
 * Ensembl REST API types (UC-440).
 * https://rest.ensembl.org
 */

export interface EnsemblTranscript {
  id: string;
  biotype: string;
  is_canonical?: number;
  start: number;
  end: number;
  strand: number;
}

export interface EnsemblGeneLookupResponse {
  id: string;
  display_name?: string;
  description?: string;
  biotype: string;
  species: string;
  assembly_name: string;
  seq_region_name: string;
  start: number;
  end: number;
  strand: number;
  version?: number;
  source?: string;
  canonical_transcript?: string;
  object_type: string;
  Transcript?: EnsemblTranscript[];
}

export interface EnsemblSequenceRegionResponse {
  id: string;
  seq: string;
  molecule: string;
  query: string;
}
