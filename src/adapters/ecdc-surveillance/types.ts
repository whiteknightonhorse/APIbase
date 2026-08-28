/** Raw row from opendata.ecdc.europa.eu/covid19/nationalcasedeath/json/ */
export interface EcdcCaseDeathRow {
  country: string;
  country_code: string;
  continent: string;
  population: number;
  indicator: string;
  weekly_count?: number;
  year_week: string;
  rate_14_day?: number;
  cumulative_count?: number;
  source: string;
  note: string;
}

/** Raw row from opendata.ecdc.europa.eu/covid19/testing/json/ */
export interface EcdcTestingRow {
  country: string;
  country_code: string;
  year_week: string;
  level: string;
  region: string;
  region_name: string;
  population: number;
  new_cases?: number;
  tests_done?: number;
  testing_rate?: number;
  positivity_rate?: number;
  testing_data_source?: string;
}

/** Raw row from opendata.ecdc.europa.eu/covid19/hospitalicuadmissionrates/json/ */
export interface EcdcHospitalIcuRow {
  country: string;
  indicator: string;
  date: string;
  year_week: string;
  value: number;
  source: string;
  url: string;
}
