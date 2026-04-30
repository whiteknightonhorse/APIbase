import { z, type ZodSchema } from 'zod';

const cnpj = z
  .object({
    cnpj: z
      .string()
      .min(14)
      .describe(
        'Brazilian company tax ID (CNPJ) — 14 digits with or without punctuation (e.g. "33000167000101" or "33.000.167/0001-01"). Returns full Receita Federal company registry data.',
      ),
  })
  .strip();

const cep = z
  .object({
    cep: z
      .string()
      .min(8)
      .describe(
        'Brazilian postal code (CEP) — 8 digits with or without dash (e.g. "01001000" or "01001-000"). Returns street, neighborhood, city, state, coords, timezone.',
      ),
  })
  .strip();

const banks = z
  .object({
    refresh: z
      .boolean()
      .optional()
      .describe(
        'Set to true to bypass cache and re-fetch the list of 472 Brazilian banks with ISPB codes.',
      ),
  })
  .strip();

const rates = z
  .object({
    refresh: z
      .boolean()
      .optional()
      .describe('Set to true to bypass cache and re-fetch current SELIC, CDI, and IPCA rates.'),
  })
  .strip();

const holidays = z
  .object({
    year: z
      .number()
      .int()
      .min(1900)
      .max(2100)
      .describe('Year (e.g. 2026). Returns all Brazilian national holidays for that year.'),
  })
  .strip();

const ddd = z
  .object({
    ddd: z
      .number()
      .int()
      .min(11)
      .max(99)
      .describe(
        'Brazilian area code (DDD) — 2 digits (e.g. 11 for São Paulo, 21 for Rio de Janeiro).',
      ),
  })
  .strip();

export const brasilapiSchemas: Record<string, ZodSchema> = {
  'brasilapi.cnpj': cnpj,
  'brasilapi.cep': cep,
  'brasilapi.banks': banks,
  'brasilapi.rates': rates,
  'brasilapi.holidays': holidays,
  'brasilapi.ddd': ddd,
};
