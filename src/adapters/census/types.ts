// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface CensusPopulationOutput {
  name: string;
  state_fips: string;
  county_fips: string | null;
  year: number;
  total_population: number | null;
  male_population: number | null;
  female_population: number | null;
}

export interface CensusDemographicsOutput {
  name: string;
  state_fips: string;
  county_fips: string | null;
  year: number;
  median_age: number | null;
  white: number | null;
  black: number | null;
  asian: number | null;
  hispanic: number | null;
  bachelors_degree_or_higher: number | null;
}

export interface CensusEconomicOutput {
  name: string;
  state_fips: string;
  county_fips: string | null;
  year: number;
  median_household_income: number | null;
  population_in_poverty: number | null;
  unemployed: number | null;
}

export interface CensusHousingOutput {
  name: string;
  state_fips: string;
  county_fips: string | null;
  year: number;
  total_housing_units: number | null;
  median_home_value: number | null;
  median_rent: number | null;
  owner_occupied: number | null;
  renter_occupied: number | null;
}
