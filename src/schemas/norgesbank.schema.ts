import { z, type ZodSchema } from 'zod';

export const norgesbankSchemas: Record<string, ZodSchema> = {
  'norgesbank.fx.latest': z
    .object({
      currencies: z
        .string()
        .optional()
        .describe(
          'Comma-separated list of ISO 4217 currency codes to include (e.g. "USD,EUR,GBP"). Leave empty to get all 41 currencies.',
        ),
    })
    .strip(),

  'norgesbank.fx.history': z
    .object({
      currency: z
        .string()
        .length(3)
        .describe(
          'ISO 4217 currency code for which to fetch historical rates against NOK (e.g. "USD", "EUR", "GBP").',
        ),
      start_date: z
        .string()
        .optional()
        .describe(
          'Start date of the historical range in ISO 8601 format (YYYY-MM-DD). Defaults to 30 days ago if omitted.',
        ),
      end_date: z
        .string()
        .optional()
        .describe(
          'End date of the historical range in ISO 8601 format (YYYY-MM-DD). Defaults to today if omitted.',
        ),
    })
    .strip(),

  'norgesbank.rates.current': z
    .object({
      include_annual: z
        .boolean()
        .optional()
        .describe(
          'Set to true to include annual average rates in addition to the latest daily and monthly rates. Default false returns only the most recent observation per rate type.',
        ),
    })
    .strip(),

  'norgesbank.rates.history': z
    .object({
      rate_type: z
        .enum(['SD', 'OL', 'RR'])
        .optional()
        .describe(
          'Type of key policy rate to retrieve: "SD" = key policy rate (deposit rate), "OL" = overnight lending rate, "RR" = reserve rate. Omit to get all three types.',
        ),
      frequency: z
        .enum(['B', 'M', 'A'])
        .optional()
        .describe(
          'Observation frequency: "B" = business daily (default), "M" = monthly average, "A" = annual average.',
        ),
      start_date: z
        .string()
        .optional()
        .describe(
          'Start date of the historical range in ISO 8601 format (YYYY-MM-DD or YYYY-MM). Defaults to 1 year ago if omitted.',
        ),
      end_date: z
        .string()
        .optional()
        .describe(
          'End date of the historical range in ISO 8601 format (YYYY-MM-DD or YYYY-MM). Defaults to today if omitted.',
        ),
    })
    .strip(),
};
