import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// finance.exchange_rates — fawazahmed0 CDN (200+ fiat + crypto currencies)
// ---------------------------------------------------------------------------

const financeExchangeRates = z
  .object({
    base: z
      .string()
      .min(2)
      .max(10)
      .describe('Base currency code (e.g. "usd", "eur", "btc"). Lowercase. 200+ currencies supported.'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Historical date in YYYY-MM-DD format. Omit for latest rates.'),
    currencies: z
      .array(z.string().describe('Currency code (e.g. "eur", "gbp", "jpy")'))
      .max(50)
      .optional()
      .describe('Filter to specific target currencies (e.g. ["eur","gbp"]). Omit for all.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// finance.ecb_rates — Frankfurter / ECB (~33 official fiat currencies)
// ---------------------------------------------------------------------------

const financeEcbRates = z
  .object({
    base: z
      .string()
      .min(3)
      .max(3)
      .describe('Base currency code, uppercase (e.g. "USD", "EUR"). ~33 ECB currencies.'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Historical date in YYYY-MM-DD format. Omit for latest ECB rates.'),
    currencies: z
      .array(z.string().describe('Currency code (e.g. "EUR", "GBP", "JPY")'))
      .max(33)
      .optional()
      .describe('Filter to specific target currencies (e.g. ["EUR","GBP"]). Omit for all ECB currencies.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// finance.economic_indicator — FRED (816K+ US economic data series)
// ---------------------------------------------------------------------------

const financeEconomicIndicator = z
  .object({
    series_id: z
      .string()
      .min(1)
      .max(50)
      .describe(
        'FRED series ID (e.g. "GDP", "CPIAUCSL", "UNRATE", "DFF", "T10Y2Y"). Browse at fred.stlouisfed.org.',
      ),
    observation_start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Start date for observations in YYYY-MM-DD format.'),
    observation_end: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('End date for observations in YYYY-MM-DD format.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100000)
      .optional()
      .describe('Maximum number of observations to return (default 100000).'),
    sort_order: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort order by observation date. Default "asc".'),
  })
  .strip();

// ---------------------------------------------------------------------------
// finance.country_data — World Bank (16K+ global development indicators)
// ---------------------------------------------------------------------------

const financeCountryData = z
  .object({
    country_code: z
      .string()
      .min(2)
      .max(3)
      .describe(
        'ISO 3166 country code (e.g. "US", "DE", "CHN") or "all" for all countries.',
      ),
    indicator_id: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'World Bank indicator ID (e.g. "NY.GDP.MKTP.CD" for GDP, "SP.POP.TOTL" for population, "FP.CPI.TOTL.ZG" for inflation).',
      ),
    date_range: z
      .string()
      .optional()
      .describe('Year or year range (e.g. "2023" or "2010:2023"). Omit for all available years.'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Results per page (default 50, max 1000).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// finance.treasury_data — US Treasury Fiscal Data
// ---------------------------------------------------------------------------

const financeTreasuryData = z
  .object({
    endpoint: z
      .enum([
        'avg_interest_rates',
        'debt_to_penny',
        'debt_outstanding',
        'top_federal',
        'gold_reserve',
        'exchange_rates_report',
      ])
      .describe(
        'Treasury dataset endpoint: avg_interest_rates (interest rates on federal debt), debt_to_penny (daily national debt), debt_outstanding (debt by security type), top_federal (top federal spending), gold_reserve (US gold reserves), exchange_rates_report (Treasury exchange rates).',
      ),
    filter: z
      .string()
      .optional()
      .describe(
        'Filter expression (e.g. "record_date:gte:2024-01-01,security_desc:eq:Treasury Bills"). See Treasury API docs.',
      ),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .describe('Number of records per page (default 100, max 10000).'),
    sort: z
      .string()
      .optional()
      .describe('Sort field with direction prefix (e.g. "-record_date" for newest first). Default: "-record_date".'),
  })
  .strip();

// ---------------------------------------------------------------------------
// finance.validate_iban — OpenIBAN (IBAN validation + bank lookup)
// ---------------------------------------------------------------------------

const financeValidateIban = z
  .object({
    iban: z
      .string()
      .min(15)
      .max(34)
      .describe(
        'IBAN to validate (e.g. "DE89370400440532013000"). Spaces are stripped automatically.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const financeSchemas: Record<string, ZodSchema> = {
  'finance.exchange_rates': financeExchangeRates,
  'finance.ecb_rates': financeEcbRates,
  'finance.economic_indicator': financeEconomicIndicator,
  'finance.country_data': financeCountryData,
  'finance.treasury_data': financeTreasuryData,
  'finance.validate_iban': financeValidateIban,
};
