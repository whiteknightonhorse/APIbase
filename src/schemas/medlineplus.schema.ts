import { z } from 'zod';

const languageParam = z
  .enum(['en', 'es'])
  .optional()
  .default('en')
  .describe('Response language: en (English) or es (Spanish). Default: en.');

export const medlineplusSchemas: Record<string, z.ZodSchema> = {
  'medlineplus.icd10_lookup': z
    .object({
      code: z
        .string()
        .describe(
          'ICD-10-CM diagnosis code to look up (e.g. E11 for Type 2 Diabetes, J18.9 for Pneumonia).',
        ),
      language: languageParam,
    })
    .strip(),

  'medlineplus.icd9_lookup': z
    .object({
      code: z
        .string()
        .describe('ICD-9-CM diagnosis code to look up (e.g. 250 for Diabetes mellitus).'),
      language: languageParam,
    })
    .strip(),

  'medlineplus.snomed_lookup': z
    .object({
      code: z
        .string()
        .describe(
          'SNOMED CT concept ID to look up (e.g. 44054006 for Diabetes mellitus type 2, 22298006 for Myocardial infarction).',
        ),
      display_name: z
        .string()
        .optional()
        .describe(
          'Human-readable SNOMED concept name (optional, improves matching). Example: "Diabetes mellitus".',
        ),
      language: languageParam,
    })
    .strip(),

  'medlineplus.rxnorm_lookup': z
    .object({
      rxcui: z
        .string()
        .describe(
          'RxNorm concept unique identifier (RXCUI) for the drug (e.g. 161 for Aspirin, 5640 for Ibuprofen, 723 for Metformin).',
        ),
      display_name: z
        .string()
        .optional()
        .describe('Human-readable drug name (optional, improves matching). Example: "Metformin".'),
      language: languageParam,
    })
    .strip(),
};
