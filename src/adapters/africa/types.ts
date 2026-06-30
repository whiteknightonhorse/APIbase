export interface AfricaCountry {
  id: string;
  name: string;
  official_name?: string;
  capital?: string;
  region?: string;
  subregion?: string;
  area_km2?: number;
  iso3?: string;
  timezone?: string;
  calling_code?: string;
  flag?: string;
  coordinates?: { latitude: number; longitude: number };
  borders?: string[];
  currencies?: Array<{ code: string; name: string; symbol: string } | string>;
  languages?: Array<{ code: string; name: string } | string>;
}

export interface AfricaCountriesMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface AfricaCountriesResponse {
  data: AfricaCountry[];
  meta: AfricaCountriesMeta;
}

export interface AfricaSignalObservation {
  metric_key: string;
  metric_name: string;
  category: string;
  frequency: string;
  year: number;
  period: string;
  as_of_period?: string | null;
  location_name?: string | null;
  value: number | null;
  unit: string;
  source: string;
  value_status: string;
  freshness: string;
  retrieved_at: string;
}

export interface AfricaCountrySignalsResponse {
  data: {
    country: { code: string; name: string; capital: string; region: string };
    observations: AfricaSignalObservation[];
  };
}

export interface AfricaFxRate {
  source_code: string;
  base_currency: string;
  quote_currency: string;
  country_codes: string[];
  rate_date: string;
  rate: number;
  created_at: string;
}

export interface AfricaFxRatesResponse {
  data: AfricaFxRate[];
}

export interface AfricaDataPoint {
  country_code: string;
  country_name?: string;
  metric_key: string;
  metric_name?: string;
  category?: string;
  year: number;
  value: number | null;
  unit?: string;
  source?: string;
  period?: string;
}

export interface AfricaDataResponse {
  data: AfricaDataPoint[];
}

export interface AfricaElection {
  id?: string;
  wikidata_id?: string;
  country_code: string;
  country_name?: string;
  election_scope?: string;
  election_type?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  year?: number;
  description?: string;
}

export interface AfricaElectionsResponse {
  data: AfricaElection[];
}
