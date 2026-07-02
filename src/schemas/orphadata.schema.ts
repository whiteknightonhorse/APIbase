import { z, type ZodSchema } from 'zod';

const LANG_ENUM = z
  .enum(['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'cs', 'tr', 'uk', 'zh'])
  .optional()
  .describe(
    'Response language (default: en). Supported: en, fr, de, es, it, pt, nl, pl, cs, tr, uk, zh.',
  );

const diseaseLookup = z
  .object({
    name: z
      .string()
      .min(1)
      .describe(
        'Preferred name (or part of it) of the rare disease to search (e.g. "Marfan syndrome", "cystic fibrosis").',
      ),
    lang: LANG_ENUM,
  })
  .strip();

const diseaseEpidemiology = z
  .object({
    orphacode: z
      .number()
      .int()
      .positive()
      .describe(
        'Orphanet ORPHAcode — the unique numeric identifier for the rare disease (e.g. 558 for Marfan syndrome).',
      ),
    lang: LANG_ENUM,
  })
  .strip();

const diseasePhenotypes = z
  .object({
    orphacode: z
      .number()
      .int()
      .positive()
      .describe(
        'Orphanet ORPHAcode of the rare disease whose HPO phenotypes to retrieve (e.g. 558 for Marfan syndrome).',
      ),
    lang: LANG_ENUM,
  })
  .strip();

const diseaseNaturalHistory = z
  .object({
    orphacode: z
      .number()
      .int()
      .positive()
      .describe(
        'Orphanet ORPHAcode of the rare disease to get inheritance mode and age-of-onset data for (e.g. 558 for Marfan syndrome).',
      ),
    lang: LANG_ENUM,
  })
  .strip();

export const orphadataSchemas: Record<string, ZodSchema> = {
  'orphadata.disease_lookup': diseaseLookup,
  'orphadata.disease_epidemiology': diseaseEpidemiology,
  'orphadata.disease_phenotypes': diseasePhenotypes,
  'orphadata.disease_natural_history': diseaseNaturalHistory,
};
