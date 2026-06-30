import { z, type ZodSchema } from 'zod';

const fluview = z
  .object({
    regions: z
      .string()
      .describe(
        'Comma-separated region codes: "nat" (national), "hhs1"-"hhs10" (HHS regions), "cen1"-"cen9" (Census regions), or 2-letter state abbreviation (e.g. "ca"). Multiple: "nat,hhs1".',
      ),
    epiweeks: z
      .string()
      .describe(
        'Epiweek(s) in YYYYWW format. Single: "202001". Range: "202001-202020". List: "202001,202010,202020". Epiweeks start Sunday; week 1 contains Jan 1.',
      ),
    issues: z
      .string()
      .optional()
      .describe(
        'Filter to a specific issue/release epiweek (YYYYWW). Omit to get the most recent revision for each epiweek.',
      ),
  })
  .strip();

const flusurv = z
  .object({
    locations: z
      .string()
      .describe(
        'FluSurv-NET location(s). "network_all" (national), "network_eip" (EIP sites), "network_ihsp" (IHSP sites), or state name (e.g. "california", "new_york"). Comma-separated for multiple.',
      ),
    epiweeks: z
      .string()
      .describe(
        'Epiweek(s) in YYYYWW format. Single: "202001". Range: "201940-202039" (full season). List: "202001,202010".',
      ),
  })
  .strip();

const covidcast = z
  .object({
    data_source: z
      .string()
      .describe(
        'Signal data source. Common values: "jhu-csse" (JHU confirmed cases/deaths), "cdc" (CDC surveillance), "hhs" (HHS hospitalization), "fb-survey" (COVID symptoms survey), "doctor-visits" (doctor visits with CLI). See https://cmu-delphi.github.io/delphi-epidata/api/covidcast_signals.html.',
      ),
    signal: z
      .string()
      .describe(
        'Signal name within the data source. Examples for jhu-csse: "confirmed_cumulative_num", "confirmed_incidence_num", "deaths_cumulative_num", "deaths_incidence_num". For hhs: "confirmed_admissions_covid_1d".',
      ),
    time_values: z
      .string()
      .describe(
        'Date(s) in YYYYMMDD format. Single: "20210101". Range: "20210101-20210131". Supports up to ~200 dates per call.',
      ),
    geo_value: z
      .string()
      .describe(
        'Geographic identifier. For state: 2-letter code (e.g. "ca", "ny"). For county: 5-digit FIPS (e.g. "06037"). For nation: "us". For hrr: HRR number. Case-insensitive.',
      ),
    geo_type: z
      .enum(['nation', 'state', 'county', 'msa', 'hrr', 'hhs'])
      .optional()
      .describe(
        'Geographic aggregation level (default: "state"). "nation"=US, "state"=US state, "county"=county FIPS, "msa"=metro area, "hrr"=hospital referral region, "hhs"=HHS region.',
      ),
    time_type: z
      .enum(['day', 'week'])
      .optional()
      .describe('Temporal resolution: "day" (daily, default) or "week" (weekly epiweek).'),
  })
  .strip();

const covidHosp = z
  .object({
    states: z
      .string()
      .describe(
        '2-letter US state abbreviation(s) (e.g. "ca", "ny", "tx"). Comma-separated for multiple states: "ca,ny,tx".',
      ),
    dates: z
      .string()
      .describe(
        'Date(s) in YYYYMMDD format. Single: "20210101". Range: "20210101-20210131". Daily HHS hospitalization data, available from 2020-07-15 onward.',
      ),
  })
  .strip();

export const delphiSchemas: Record<string, ZodSchema> = {
  'delphi.fluview': fluview,
  'delphi.flusurv': flusurv,
  'delphi.covidcast': covidcast,
  'delphi.covid_hosp': covidHosp,
};
