// iNaturalist API v1 (https://api.inaturalist.org/v1) — raw response shapes.
// Only fields actually consumed by parseResponse() are declared.

export interface InatPhoto {
  id: number;
  url: string;
  attribution?: string;
  license_code?: string | null;
}

export interface InatTaxon {
  id: number;
  name: string;
  rank: string;
  preferred_common_name?: string;
  iconic_taxon_name?: string;
  observations_count?: number;
  extinct?: boolean;
  threatened?: boolean;
  wikipedia_url?: string;
  default_photo?: InatPhoto | null;
}

export interface InatTaxaSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  results: InatTaxon[];
}

export interface InatObservation {
  id: number;
  uuid: string;
  species_guess?: string | null;
  taxon?: InatTaxon | null;
  observed_on?: string | null;
  location?: string | null;
  place_guess?: string | null;
  quality_grade?: string;
  uri?: string;
  user?: { login?: string } | null;
  photos?: InatPhoto[];
}

export interface InatObservationsSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  results: InatObservation[];
}

export interface InatSpeciesCount {
  count: number;
  taxon: InatTaxon;
}

export interface InatSpeciesCountsResponse {
  total_results: number;
  page: number;
  per_page: number;
  results: InatSpeciesCount[];
}

export interface InatPlace {
  id: number;
  name: string;
  display_name?: string;
  place_type?: number;
  bbox_area?: number;
  ancestor_place_ids?: number[];
}

export interface InatPlacesSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  results: InatPlace[];
}
