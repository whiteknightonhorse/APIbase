import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    terms: z
      .string()
      .min(1)
      .describe(
        'Clinical search term — disease name, symptom, or condition (e.g. "diabetes mellitus", "pneumonia", "hypertension", "fracture")',
      ),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .default(10)
      .describe('Maximum number of results to return (1-25). Default: 10'),
  })
  .strip();

const lookup = z
  .object({
    code: z
      .string()
      .min(2)
      .describe(
        'ICD-11 code to look up — alphanumeric code from the ICD-11 classification (e.g. "BA00" for essential hypertension, "5A10" for type 1 diabetes, "CA40" for pneumonia)',
      ),
  })
  .strip();

const autocomplete = z
  .object({
    terms: z
      .string()
      .min(1)
      .describe(
        'Partial clinical term for autocomplete suggestions (e.g. "dia" → diabetes options, "hyp" → hypertension options)',
      ),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe('Maximum number of autocomplete suggestions (1-10). Default: 5'),
  })
  .strip();

const primarySearch = z
  .object({
    terms: z
      .string()
      .min(1)
      .describe(
        'Clinical search term to find primary (stem) ICD-11 diagnosis codes only — excludes extension/modifier codes (e.g. "cancer", "fever", "infection")',
      ),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .default(10)
      .describe('Maximum number of primary (stem) codes to return (1-25). Default: 10'),
  })
  .strip();

export const nlmIcd11Schemas: Record<string, ZodSchema> = {
  'icd11.search': search,
  'icd11.lookup': lookup,
  'icd11.autocomplete': autocomplete,
  'icd11.primary_search': primarySearch,
};
