import { z } from 'zod';

const CURRENCY_CODES =
  'AUD,BRL,CAD,CHF,CNY,CZK,DKK,EUR,GBP,HKD,HUF,IDR,ILS,INR,ISK,JPY,KRW,MXN,MYR,NOK,NZD,PHP,PLN,RON,SEK,SGD,THB,TRY,USD,ZAR';

export const frankfurterSchemas: Record<string, z.ZodTypeAny> = {
  'frankfurter.latest': z
    .object({
      base: z
        .string()
        .length(3)
        .optional()
        .describe(
          `Base currency ISO 4217 code to convert from (default: EUR). Supported: ${CURRENCY_CODES}`,
        ),
      symbols: z
        .string()
        .optional()
        .describe(
          'Comma-separated target currency codes to return (e.g. USD,GBP,JPY). Omit for all 33 currencies.',
        ),
      amount: z
        .number()
        .positive()
        .optional()
        .describe('Amount to convert (default: 1.0). Returns rates scaled to this amount.'),
    })
    .strip(),

  'frankfurter.historical': z
    .object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe(
          'Historical date in YYYY-MM-DD format. ECB data available from 1999-01-04. Weekends/holidays return the preceding business day.',
        ),
      base: z
        .string()
        .length(3)
        .optional()
        .describe(`Base currency ISO 4217 code (default: EUR). Supported: ${CURRENCY_CODES}`),
      symbols: z
        .string()
        .optional()
        .describe(
          'Comma-separated target currency codes (e.g. USD,GBP). Omit for all 33 currencies.',
        ),
      amount: z.number().positive().optional().describe('Amount to convert (default: 1.0).'),
    })
    .strip(),

  'frankfurter.series': z
    .object({
      start_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe(
          'Start date of the time series in YYYY-MM-DD format. ECB data available from 1999-01-04.',
        ),
      end_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
          'End date of the time series in YYYY-MM-DD format. Defaults to the latest available date.',
        ),
      base: z
        .string()
        .length(3)
        .optional()
        .describe(`Base currency ISO 4217 code (default: EUR). Supported: ${CURRENCY_CODES}`),
      symbols: z
        .string()
        .optional()
        .describe(
          'Comma-separated target currency codes (e.g. USD,GBP,JPY). Omit for all 33 currencies. Use specific symbols to reduce response size.',
        ),
      amount: z.number().positive().optional().describe('Amount to convert (default: 1.0).'),
    })
    .strip(),

  'frankfurter.currencies': z
    .object({
      locale: z
        .string()
        .optional()
        .describe(
          'Reserved for future use. The API returns currency names in English regardless. Pass any value.',
        ),
    })
    .strip(),
};
