// ---------------------------------------------------------------------------
// CMU Delphi Epidata — Normalized output types (UC-559)
// ---------------------------------------------------------------------------

export interface DelphiFluViewRecord {
  region: string;
  epiweek: number;
  season: string;
  wili: number | null;
  ili: number | null;
  num_ili: number | null;
  num_patients: number | null;
  num_providers: number | null;
  age_0_4: number | null;
  age_5_24: number | null;
  age_25_49: number | null;
  age_50_64: number | null;
  age_65_plus: number | null;
  issue: number;
  lag: number;
}

export interface DelphiFluViewOutput {
  count: number;
  records: DelphiFluViewRecord[];
}

export interface DelphiFluSurvRecord {
  location: string;
  epiweek: number;
  season: string;
  rate_overall: number | null;
  rate_age_0: number | null;
  rate_age_1: number | null;
  rate_age_2: number | null;
  rate_age_3: number | null;
  rate_age_4: number | null;
  rate_sex_male: number | null;
  rate_sex_female: number | null;
  issue: number;
  lag: number;
}

export interface DelphiFluSurvOutput {
  count: number;
  records: DelphiFluSurvRecord[];
}

export interface DelphiCovidCastRecord {
  geo_value: string;
  geo_type: string;
  signal: string;
  source: string;
  time_value: number;
  value: number | null;
  stderr: number | null;
  sample_size: number | null;
  direction: number | null;
  issue: number;
  lag: number;
}

export interface DelphiCovidCastOutput {
  count: number;
  records: DelphiCovidCastRecord[];
}

export interface DelphiCovidHospRecord {
  state: string;
  date: number;
  adult_icu: number | null;
  adult_hosp: number | null;
  ped_icu: number | null;
  ped_hosp: number | null;
  total_icu: number | null;
  total_hosp: number | null;
  new_adult_hosp: number | null;
  new_ped_hosp: number | null;
}

export interface DelphiCovidHospOutput {
  count: number;
  records: DelphiCovidHospRecord[];
}
