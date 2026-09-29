// Raw response shapes for the NOAA Fisheries FOSS ODS REST API
// (apps-st.fisheries.noaa.gov/ods/foss). Only the fields consumed by the adapter are typed.

export interface OdsPage<T> {
  items?: T[];
  hasMore?: boolean;
  limit?: number;
  offset?: number;
  count?: number;
}

export interface FossLandingRow {
  tsn?: string | null;
  ts_afs_name?: string | null;
  ts_scientific_name?: string | null;
  region_name?: string | null;
  state_name?: string | null;
  year?: number | null;
  pounds?: number | null;
  dollars?: number | null;
  tot_count?: number | null;
  source?: string | null;
  collection?: string | null;
}

export interface FossSurveySpeciesRow {
  species_code?: number | null;
  scientific_name?: string | null;
  common_name?: string | null;
  id_rank?: string | null;
  worms?: number | null;
  itis?: number | null;
}

export interface FossSurveyCatchRow {
  hauljoin?: number | null;
  species_code?: number | null;
  cpue_kgkm2?: number | null;
  cpue_nokm2?: number | null;
  count?: number | null;
  weight_kg?: number | null;
  taxon_confidence?: string | null;
}
