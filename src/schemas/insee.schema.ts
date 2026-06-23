import { z } from 'zod';

export const inseeSchemas: Record<string, z.ZodTypeAny> = {
  'insee.company_by_siren': z
    .object({
      siren: z
        .string()
        .regex(/^\d{9}$/)
        .describe(
          'SIREN company identifier — exactly 9 digits (e.g. 552081317 for EDF). Spaces are stripped automatically.',
        ),
    })
    .strip(),

  'insee.establishment_by_siret': z
    .object({
      siret: z
        .string()
        .regex(/^\d{14}$/)
        .describe(
          'SIRET establishment identifier — exactly 14 digits (SIREN + NIC, e.g. 55208131766522). Spaces are stripped automatically.',
        ),
    })
    .strip(),

  'insee.search_companies': z
    .object({
      q: z
        .string()
        .describe(
          'Lucene-style filter expression on legal-unit fields. Examples: ' +
            '"denominationUniteLegale:AIRBUS" searches by company name; ' +
            '"activitePrincipaleUniteLegale:62.01Z" searches by NAF activity code; ' +
            '"etatAdministratifUniteLegale:A" returns only active companies (A=active, C=ceased); ' +
            '"categorieJuridiqueUniteLegale:5710" searches by legal category code. ' +
            'Combine with AND / OR operators.',
        ),
      max: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Maximum number of results to return (1–20, default 10).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Zero-based starting offset for pagination (default 0).'),
    })
    .strip(),

  'insee.search_establishments': z
    .object({
      q: z
        .string()
        .describe(
          'Lucene-style filter expression on establishment fields. Examples: ' +
            '"codePostalEtablissement:75008" searches by French postal code; ' +
            '"libelleCommuneEtablissement:PARIS" searches by city name; ' +
            '"activitePrincipaleEtablissement:47.11B" searches by NAF activity code; ' +
            '"etatAdministratifEtablissement:A" returns only active establishments (A=active, F=closed); ' +
            '"denominationUniteLegale:CARREFOUR" filters by parent company name. ' +
            'Combine with AND / OR operators.',
        ),
      max: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Maximum number of results to return (1–20, default 10).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Zero-based starting offset for pagination (default 0).'),
    })
    .strip(),
};
