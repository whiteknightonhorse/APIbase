import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CensusPopulationOutput,
  CensusDemographicsOutput,
  CensusEconomicOutput,
  CensusHousingOutput,
} from './types';

const CENSUS_BASE = 'https://api.census.gov/data';

/** Variable sets per tool */
const VARS: Record<string, string[]> = {
  'census.population': ['NAME', 'B01001_001E', 'B01001_002E', 'B01001_026E'],
  'census.demographics': [
    'NAME',
    'B01002_001E',
    'B02001_002E',
    'B02001_003E',
    'B02001_005E',
    'B03001_003E',
    'B15003_022E',
  ],
  'census.economic': ['NAME', 'B19013_001E', 'B17001_002E', 'B23025_005E'],
  'census.housing': [
    'NAME',
    'B25001_001E',
    'B25077_001E',
    'B25064_001E',
    'B25003_002E',
    'B25003_003E',
  ],
};

/**
 * US Census Bureau adapter (UC-333).
 *
 * American Community Survey 5-year estimates — population, demographics,
 * income, housing for all US geographies (state/county/tract).
 *
 * Auth: API key as query param `key=`. US Gov open data, unlimited.
 * Response format: array-of-arrays, first row = header.
 */
export class CensusAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'census', baseUrl: CENSUS_BASE });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const vars = VARS[req.toolId];
    if (!vars) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const year = Number(params.year) || 2022;
    const stateFips = encodeURIComponent(String(params.state_fips));
    const countyFips = params.county_fips ? encodeURIComponent(String(params.county_fips)) : null;

    const qp = new URLSearchParams();
    qp.set('get', vars.join(','));
    qp.set('key', this.apiKey);

    if (countyFips) {
      qp.set('for', `county:${countyFips}`);
      if (stateFips !== '*') {
        qp.set('in', `state:${stateFips}`);
      }
    } else {
      qp.set('for', `state:${stateFips}`);
    }

    return {
      url: `${CENSUS_BASE}/${year}/acs/acs5?${qp.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const rows = raw.body as string[][];
    if (!Array.isArray(rows) || rows.length < 2) {
      return { results: [], total: 0 };
    }

    const header = rows[0];
    const data = rows.slice(1);

    // Zip header + data into objects
    const records = data.map((row) => {
      const obj: Record<string, string | null> = {};
      for (let i = 0; i < header.length; i++) {
        obj[header[i]] = row[i] ?? null;
      }
      return obj;
    });

    const params = req.params as Record<string, unknown>;
    const year = Number(params.year) || 2022;

    switch (req.toolId) {
      case 'census.population':
        return records.map((r) => this.parsePopulation(r, year));
      case 'census.demographics':
        return records.map((r) => this.parseDemographics(r, year));
      case 'census.economic':
        return records.map((r) => this.parseEconomic(r, year));
      case 'census.housing':
        return records.map((r) => this.parseHousing(r, year));
      default:
        return records;
    }
  }

  private num(v: string | null | undefined): number | null {
    if (v == null || v === '' || v === '-') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private parsePopulation(r: Record<string, string | null>, year: number): CensusPopulationOutput {
    return {
      name: r.NAME ?? '',
      state_fips: r.state ?? '',
      county_fips: r.county ?? null,
      year,
      total_population: this.num(r.B01001_001E),
      male_population: this.num(r.B01001_002E),
      female_population: this.num(r.B01001_026E),
    };
  }

  private parseDemographics(
    r: Record<string, string | null>,
    year: number,
  ): CensusDemographicsOutput {
    return {
      name: r.NAME ?? '',
      state_fips: r.state ?? '',
      county_fips: r.county ?? null,
      year,
      median_age: this.num(r.B01002_001E),
      white: this.num(r.B02001_002E),
      black: this.num(r.B02001_003E),
      asian: this.num(r.B02001_005E),
      hispanic: this.num(r.B03001_003E),
      bachelors_degree_or_higher: this.num(r.B15003_022E),
    };
  }

  private parseEconomic(r: Record<string, string | null>, year: number): CensusEconomicOutput {
    return {
      name: r.NAME ?? '',
      state_fips: r.state ?? '',
      county_fips: r.county ?? null,
      year,
      median_household_income: this.num(r.B19013_001E),
      population_in_poverty: this.num(r.B17001_002E),
      unemployed: this.num(r.B23025_005E),
    };
  }

  private parseHousing(r: Record<string, string | null>, year: number): CensusHousingOutput {
    return {
      name: r.NAME ?? '',
      state_fips: r.state ?? '',
      county_fips: r.county ?? null,
      year,
      total_housing_units: this.num(r.B25001_001E),
      median_home_value: this.num(r.B25077_001E),
      median_rent: this.num(r.B25064_001E),
      owner_occupied: this.num(r.B25003_002E),
      renter_occupied: this.num(r.B25003_003E),
    };
  }
}
