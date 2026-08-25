import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// Shared period-range fields (all 4 ECB Data Portal tools)
// ---------------------------------------------------------------------------

const periodFields = {
  last_n_observations: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(
      'Return only the most recent N observations (max 100). Takes precedence over start_period/end_period. Default 10 if no range given.',
    ),
  start_period: z
    .string()
    .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
    .optional()
    .describe(
      'Start of date range: YYYY, YYYY-MM, or YYYY-MM-DD depending on series frequency. Ignored if last_n_observations is set.',
    ),
  end_period: z
    .string()
    .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
    .optional()
    .describe(
      'End of date range: YYYY, YYYY-MM, or YYYY-MM-DD depending on series frequency. Ignored if last_n_observations is set.',
    ),
};

// ---------------------------------------------------------------------------
// ecb-rates.key_rates — ECB key interest rates (FM dataflow)
// ---------------------------------------------------------------------------

const ecbRatesKeyRates = z
  .object({
    rate_type: z
      .enum(['main_refinancing', 'deposit_facility', 'marginal_lending'])
      .optional()
      .describe(
        'Which ECB key interest rate to fetch: main_refinancing (MRO rate), deposit_facility (rate banks earn on overnight deposits), marginal_lending (overnight borrowing rate). Default deposit_facility.',
      ),
    ...periodFields,
  })
  .strip();

// ---------------------------------------------------------------------------
// ecb-rates.hicp_inflation — Euro area HICP annual inflation rate (ICP dataflow)
// ---------------------------------------------------------------------------

const ecbRatesHicpInflation = z
  .object({
    ...periodFields,
  })
  .strip();

// ---------------------------------------------------------------------------
// ecb-rates.money_supply — Euro area M3 monetary aggregate (BSI dataflow)
// ---------------------------------------------------------------------------

const ecbRatesMoneySupply = z
  .object({
    ...periodFields,
  })
  .strip();

// ---------------------------------------------------------------------------
// ecb-rates.yield_curve — Euro area AAA government bond spot rate (YC dataflow)
// ---------------------------------------------------------------------------

const ecbRatesYieldCurve = z
  .object({
    tenor_years: z
      .enum(['1', '5', '10', '30'])
      .optional()
      .describe('Bond maturity in years for the spot rate: "1", "5", "10", or "30". Default "10".'),
    ...periodFields,
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const ecbRatesSchemas: Record<string, ZodSchema> = {
  'ecb-rates.key_rates': ecbRatesKeyRates,
  'ecb-rates.hicp_inflation': ecbRatesHicpInflation,
  'ecb-rates.money_supply': ecbRatesMoneySupply,
  'ecb-rates.yield_curve': ecbRatesYieldCurve,
};
