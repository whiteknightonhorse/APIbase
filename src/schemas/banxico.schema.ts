import { z, type ZodSchema } from 'zod';

const dateRangeFields = {
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      'Start date for historical range in YYYY-MM-DD format (e.g. 2026-01-01). ' +
        'Omit for latest observation only.',
    ),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      'End date for historical range in YYYY-MM-DD format (e.g. 2026-06-30). ' +
        'Required when start_date is provided.',
    ),
};

const fixRateSchema = z
  .object({
    ...dateRangeFields,
  })
  .strip()
  .describe(
    'Query the official Banxico FIX USD/MXN exchange rate. ' +
      'Omit dates for the latest observation; supply both for a historical range.',
  );

const fxRatesSchema = z
  .object({
    locale: z
      .string()
      .optional()
      .describe('Reserved for future locale support. Leave empty — response is always in English.'),
  })
  .strip()
  .describe('Get current MXN exchange rates for USD, EUR, CAD, and GBP simultaneously.');

const targetRateSchema = z
  .object({
    ...dateRangeFields,
  })
  .strip()
  .describe(
    'Query the Banxico overnight target interest rate (Tasa objetivo). ' +
      'Omit dates for the latest observation; supply both for a historical range.',
  );

const tiieRateSchema = z
  .object({
    ...dateRangeFields,
  })
  .strip()
  .describe(
    'Query the TIIE 28-day interbank offered rate. ' +
      'Omit dates for the latest value; supply both for a historical range.',
  );

const cpiSchema = z
  .object({
    ...dateRangeFields,
  })
  .strip()
  .describe(
    'Query the Mexico INPC (Índice Nacional de Precios al Consumidor) consumer price index. ' +
      'Omit dates for the latest monthly reading; supply both for a historical range.',
  );

export const banxicoSchemas: Record<string, ZodSchema> = {
  'banxico.fix_rate': fixRateSchema,
  'banxico.fx_rates': fxRatesSchema,
  'banxico.target_rate': targetRateSchema,
  'banxico.tiie_rate': tiieRateSchema,
  'banxico.cpi': cpiSchema,
};
