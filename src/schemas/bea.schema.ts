import { z } from 'zod';

const frequencyNipa = z
  .enum(['A', 'Q', 'M', 'A,Q', 'A,Q,M'])
  .optional()
  .describe(
    'Data frequency: A=Annual, Q=Quarterly, M=Monthly. ' +
      'Multiple values comma-separated (e.g. "A,Q"). Defaults to A.',
  );

const yearParam = z
  .string()
  .optional()
  .describe(
    'Year(s) to retrieve. Single year (e.g. "2023"), comma-separated list ("2021,2022,2023"), ' +
      '"LAST5" for latest 5 years, "LAST10" for latest 10, or "X"/"ALL" for all years. ' +
      'Defaults to LAST5.',
  );

export const beaSchemas: Record<string, z.ZodTypeAny> = {
  'bea.gdp': z
    .object({
      frequency: frequencyNipa,
      year: yearParam,
    })
    .strip()
    .describe(
      'Retrieve US Real GDP growth rates from BEA NIPA Table T10101. ' +
        'Returns percent-change series for GDP, personal consumption, investment, ' +
        'exports, imports, and government spending.',
    ),

  'bea.personal_income': z
    .object({
      frequency: frequencyNipa,
      year: yearParam,
    })
    .strip()
    .describe(
      'Retrieve US Personal Income and Outlays from BEA NIPA Table T20100. ' +
        'Includes compensation, proprietors income, dividends, interest, ' +
        'personal taxes, and disposable personal income (millions of dollars).',
    ),

  'bea.trade_balance': z
    .object({
      indicator: z
        .string()
        .optional()
        .describe(
          'BEA ITA indicator code. Common values: "BalGdsServ" (balance on goods and services, default), ' +
            '"BalGds" (goods only), "BalServ" (services only), "BalCurrAcct" (current account balance), ' +
            '"ExpGds" (goods exports), "ImpGds" (goods imports). ' +
            'See BEA ITA documentation for all 889 available indicators.',
        ),
      area_or_country: z
        .string()
        .optional()
        .describe(
          'Country or area filter. "AllCountries" (default) for world totals, or a specific country ' +
            'name such as "China", "Canada", "Mexico", "Germany", "Japan". ' +
            'Use "AreaAll" for regional groupings.',
        ),
      frequency: z
        .enum(['A', 'Q'])
        .optional()
        .describe('Data frequency: A=Annual (default), Q=Quarterly.'),
      year: yearParam,
    })
    .strip()
    .describe(
      'Retrieve US international trade balance data from the BEA International Transactions ' +
        'Accounts (ITA) dataset. Covers balance on goods, services, current account, and 800+ ' +
        'individual ITA indicators by country or region (millions of dollars, annual/quarterly).',
    ),

  'bea.state_gdp': z
    .object({
      geo_fips: z
        .string()
        .optional()
        .describe(
          'Geographic FIPS code(s) to retrieve. "STATE" (default) returns all 50 US states + DC, ' +
            '"COUNTY" for all counties, "MSA" for metro areas, or a specific 5-digit FIPS code ' +
            '(e.g. "06000" for California, "36000" for New York). ' +
            'Comma-separate multiple codes (e.g. "06000,36000,48000").',
        ),
      year: yearParam,
      line_code: z
        .number()
        .int()
        .optional()
        .describe(
          'CAGDP2 line code for the GDP component. 1=All industry total (default), ' +
            '2=Private industries, 3=Agriculture/forestry/fishing, ' +
            '6=Mining, 10=Utilities, 11=Construction, 34=Manufacturing, ' +
            '50=Wholesale trade, 55=Retail trade, 60=Transportation, ' +
            '75=Information, 82=Finance/insurance, 100=Real estate, ' +
            '300=Government.',
        ),
    })
    .strip()
    .describe(
      'Retrieve real GDP by US state from BEA Regional CAGDP2 table. ' +
        'Returns GDP in thousands of dollars by state, year, and industry component. ' +
        'Data covers all 50 states plus DC and US total, sourced from BEA Regional Economic Accounts.',
    ),

  'bea.industry_gdp': z
    .object({
      industry: z
        .string()
        .optional()
        .describe(
          'Industry NAICS code(s) to retrieve. "ALL" (default) returns all industries. ' +
            'Common codes: "11"=Agriculture, "21"=Mining, "22"=Utilities, "23"=Construction, ' +
            '"31-33"=Manufacturing, "42"=Wholesale, "44-45"=Retail, ' +
            '"51"=Information, "52"=Finance, "53"=Real estate, ' +
            '"54"=Professional services, "62"=Health care, "92"=Government. ' +
            'Comma-separate multiple codes (e.g. "11,21,22").',
        ),
      frequency: z
        .enum(['A', 'Q'])
        .optional()
        .describe('Data frequency: A=Annual (default), Q=Quarterly.'),
      year: yearParam,
    })
    .strip()
    .describe(
      'Retrieve value added by industry (GDP contribution) from BEA GDP by Industry table. ' +
        'Returns value added in billions of dollars for each NAICS industry sector, showing ' +
        'how much each industry contributes to total US GDP. Annual or quarterly frequency.',
    ),
};
