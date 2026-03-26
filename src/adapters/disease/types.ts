/** disease.sh API response types (UC-192). */

export interface CovidGlobalResponse {
  cases: number;
  todayCases: number;
  deaths: number;
  todayDeaths: number;
  recovered: number;
  todayRecovered: number;
  active: number;
  critical: number;
  casesPerOneMillion: number;
  deathsPerOneMillion: number;
  tests: number;
  testsPerOneMillion: number;
  population: number;
  affectedCountries: number;
  updated: number;
}

export interface CovidCountryResponse extends CovidGlobalResponse {
  country: string;
  countryInfo: {
    iso2: string;
    iso3: string;
    flag: string;
    lat: number;
    long: number;
  };
  continent: string;
}

export interface CovidHistoricalResponse {
  country: string;
  province: string[];
  timeline: {
    cases: Record<string, number>;
    deaths: Record<string, number>;
    recovered: Record<string, number>;
  };
}

export interface InfluenzaResponse {
  updated: number;
  source: string;
  data: Array<Record<string, unknown>>;
}
