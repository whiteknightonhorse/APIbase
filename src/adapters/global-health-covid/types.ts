/** Raw row from v3/index.csv — location metadata catalog. */
export interface GlobalHealthCovidIndexRow {
  location_key: string;
  place_id?: string;
  wikidata_id?: string;
  datacommons_id?: string;
  country_code?: string;
  country_name?: string;
  subregion1_code?: string;
  subregion1_name?: string;
  subregion2_code?: string;
  subregion2_name?: string;
  locality_code?: string;
  locality_name?: string;
  iso_3166_1_alpha_2?: string;
  iso_3166_1_alpha_3?: string;
  aggregation_level?: string;
}

/** Raw row from v3/latest/epidemiology.csv — one row per location_key, latest known date. */
export interface GlobalHealthCovidEpidemiologyRow {
  date: string;
  location_key: string;
  new_confirmed?: string;
  new_deceased?: string;
  new_recovered?: string;
  new_tested?: string;
  cumulative_confirmed?: string;
  cumulative_deceased?: string;
  cumulative_recovered?: string;
  cumulative_tested?: string;
}

/** Raw row from v3/latest/hospitalizations.csv — one row per location_key, latest known date. */
export interface GlobalHealthCovidHospitalizationsRow {
  date: string;
  location_key: string;
  new_hospitalized_patients?: string;
  cumulative_hospitalized_patients?: string;
  current_hospitalized_patients?: string;
  new_intensive_care_patients?: string;
  cumulative_intensive_care_patients?: string;
  current_intensive_care_patients?: string;
  new_ventilator_patients?: string;
  cumulative_ventilator_patients?: string;
  current_ventilator_patients?: string;
}

/** Raw row from v3/latest/vaccinations.csv — one row per location_key, latest known date (per-brand columns ignored). */
export interface GlobalHealthCovidVaccinationsRow {
  date: string;
  location_key: string;
  new_persons_vaccinated?: string;
  cumulative_persons_vaccinated?: string;
  new_persons_fully_vaccinated?: string;
  cumulative_persons_fully_vaccinated?: string;
  new_vaccine_doses_administered?: string;
  cumulative_vaccine_doses_administered?: string;
}

/**
 * Raw row from v3/location/{location_key}.csv — full joined daily time series.
 * The real upstream row has 700+ columns (demographic/policy/search-trends covariates);
 * only the fields APIbase projects downstream are declared here.
 */
export interface GlobalHealthCovidLocationHistoryRow {
  date: string;
  location_key: string;
  new_confirmed?: string;
  new_deceased?: string;
  cumulative_confirmed?: string;
  cumulative_deceased?: string;
  new_hospitalized_patients?: string;
  current_hospitalized_patients?: string;
  new_persons_vaccinated?: string;
  cumulative_persons_vaccinated?: string;
  new_persons_fully_vaccinated?: string;
  cumulative_persons_fully_vaccinated?: string;
  population?: string;
}
