import { z, type ZodSchema } from 'zod';

const countriesListSchema = z
  .object({
    region: z
      .enum(['North Africa', 'West Africa', 'East Africa', 'Central Africa', 'Southern Africa'])
      .optional()
      .describe(
        'Filter by African sub-region. One of: "North Africa", "West Africa", "East Africa", ' +
          '"Central Africa", "Southern Africa". Omit to return all 54 countries.',
      ),
  })
  .strip()
  .describe(
    'List all 54 African countries with ISO codes, capitals, regions, currencies, and languages. ' +
      'Optionally filter by sub-region.',
  );

const countrySignalsSchema = z
  .object({
    country_code: z
      .string()
      .length(2)
      .toLowerCase()
      .describe(
        'ISO 3166-1 alpha-2 country code (2-letter lowercase, e.g. "ng" for Nigeria, ' +
          '"ke" for Kenya, "za" for South Africa, "eg" for Egypt, "gh" for Ghana).',
      ),
  })
  .strip()
  .describe(
    'Get a live macroeconomic snapshot for an African country. Returns 20–60 indicators ' +
      'across economy, climate, health, and trade — GDP, inflation, air quality, precipitation, ' +
      'population, and more. Sources: World Bank, IMF, UN, NASA POWER.',
  );

const fxRatesSchema = z
  .object({
    country_code: z
      .string()
      .length(2)
      .toLowerCase()
      .optional()
      .describe(
        'Filter FX rates to the currency of a single country (ISO 3166-1 alpha-2, e.g. "ng" for NGN, ' +
          '"ke" for KES, "za" for ZAR). Omit to return all 50+ African currency rates.',
      ),
    quote_currencies: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of specific quote currencies to return (e.g. "NGN,KES,ZAR,GHS,EGP"). ' +
          'Omit to return all available African currencies.',
      ),
  })
  .strip()
  .describe(
    'Get daily USD exchange rates for all 50+ African currencies. Returns current rate per USD ' +
      'for NGN (Nigeria), KES (Kenya), ZAR (South Africa), EGP (Egypt), GHS (Ghana), ' +
      'and all other African currency pairs. Rates updated daily.',
  );

const indicatorDataSchema = z
  .object({
    country_code: z
      .string()
      .length(2)
      .toLowerCase()
      .describe(
        'ISO 3166-1 alpha-2 country code (2-letter lowercase, e.g. "ng", "ke", "za", "eg", "gh").',
      ),
    metric_key: z
      .string()
      .describe(
        'Economic indicator key (e.g. "gdp_usd" for GDP in USD, "inflation_pct" for CPI inflation rate, ' +
          '"gdp_per_capita_usd" for GDP per capita, "unemployment_pct" for unemployment rate, ' +
          '"trade_balance_usd" for trade balance, "fdi_inflows_usd" for foreign direct investment). ' +
          'Use africa.countries.signals to discover available metric_key values for a country.',
      ),
    start_year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe(
        'Start year for historical range (e.g. 2015). Omit along with end_year to return the ' +
          'single latest observation.',
      ),
    end_year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe('End year for historical range (e.g. 2024). Required when start_year is provided.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of data points to return (1–100, default 20).'),
  })
  .strip()
  .describe(
    'Query a specific economic indicator time series for an African country. Supports GDP, ' +
      'inflation, unemployment, trade balance, FDI, population, and 120+ other metrics. ' +
      'Returns annual data from World Bank, IMF, and UN sources. ' +
      'Omit years for latest observation only; supply both for historical range.',
  );

const electionsSchema = z
  .object({
    country_code: z
      .string()
      .length(2)
      .toLowerCase()
      .optional()
      .describe(
        'ISO 3166-1 alpha-2 country code to filter elections to a single country ' +
          '(e.g. "ng", "ke", "za", "eg"). Omit to return elections for all 54 countries.',
      ),
    status: z
      .enum(['upcoming', 'completed', 'ongoing'])
      .optional()
      .describe(
        'Filter by election status: "upcoming" (future elections), "completed" (past elections), ' +
          'or "ongoing" (elections currently in progress).',
      ),
    start_year: z
      .number()
      .int()
      .min(1990)
      .max(2030)
      .optional()
      .describe('Filter elections from this year onwards (e.g. 2020).'),
    end_year: z
      .number()
      .int()
      .min(1990)
      .max(2030)
      .optional()
      .describe('Filter elections up to and including this year (e.g. 2025).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of elections to return (1–100, default 20).'),
  })
  .strip()
  .describe(
    'List elections across African countries. Returns presidential, parliamentary, ' +
      'and local government elections with status, dates, and election scope. ' +
      'Filter by country, status (upcoming/completed), or year range.',
  );

export const africaSchemas: Record<string, ZodSchema> = {
  'africa.countries.list': countriesListSchema,
  'africa.countries.signals': countrySignalsSchema,
  'africa.markets.fx_rates': fxRatesSchema,
  'africa.data.indicator': indicatorDataSchema,
  'africa.politics.elections': electionsSchema,
};
