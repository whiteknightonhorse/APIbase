import { z, type ZodSchema } from 'zod';

export const rxnormSchemas: Record<string, ZodSchema> = {
  'rxnorm.drug_search': z
    .object({
      name: z
        .string()
        .min(1)
        .describe(
          'Drug name to search — generic name (e.g. "aspirin"), brand name (e.g. "Tylenol"), or ingredient (e.g. "acetaminophen")',
        ),
      tty: z
        .enum([
          'IN',
          'PIN',
          'MIN',
          'SCD',
          'SBD',
          'BN',
          'SCDC',
          'SCDF',
          'SBDC',
          'SBDF',
          'GPCK',
          'BPCK',
        ])
        .optional()
        .describe(
          'Filter by RxNorm term type (TTY). Common values: IN=Ingredient, BN=Brand Name, SCD=Semantic Clinical Drug (includes dose/form), SBD=Semantic Branded Drug. Omit to return all types.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Maximum number of drug concepts to return (1–100, default 20)'),
    })
    .strip(),

  'rxnorm.rxcui_properties': z
    .object({
      rxcui: z
        .string()
        .min(1)
        .describe(
          'RxNorm concept unique identifier (RxCUI) — a numeric string assigned by NLM (e.g. "1191" for aspirin, "161" for acetaminophen). Obtain from rxnorm.drug_search.',
        ),
    })
    .strip(),

  'rxnorm.ndc_lookup': z
    .object({
      ndc: z
        .string()
        .min(1)
        .describe(
          'National Drug Code (NDC) in any of the standard formats: 10-digit (0069-3060-86), 11-digit (00069306086), or hyphenated (0069-3060-86). Found on drug packaging labels in the US.',
        ),
    })
    .strip(),

  'rxnorm.drug_class': z
    .object({
      rxcui: z
        .string()
        .min(1)
        .describe(
          'RxNorm concept unique identifier (RxCUI) of the drug ingredient or concept (e.g. "1191" for aspirin). Obtain from rxnorm.drug_search or rxnorm.rxcui_properties.',
        ),
      class_types: z
        .string()
        .optional()
        .describe(
          'Space-separated list of drug classification systems to query. Options: ATC1-4 (WHO Anatomical Therapeutic Chemical), VA (VA Drug Class), EPC (FDA Established Pharmacologic Class), MOA (Mechanism of Action), PE (Physiologic Effect), MESH (MeSH pharmacological actions), DISEASE (indications). Omit to return all available classifications.',
        ),
      source: z
        .string()
        .optional()
        .describe(
          'Filter by classification source. Options: ATCPROD (ATC WHO), VA (Veterans Affairs), FDASPL (FDA SPL/EPC), DAILYMED (DailyMed), RXNORM (RxNorm). Omit to include all sources.',
        ),
    })
    .strip(),
};
