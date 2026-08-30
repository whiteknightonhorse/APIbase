import { z, type ZodSchema } from 'zod';

const countryField = z
  .string()
  .length(3)
  .describe('ISO3166 alpha-3 country code (e.g. "KEN", "IDN", "BRA").');

const speciesField = z
  .enum(['pf', 'pv'])
  .describe('Malaria parasite species: "pf" (Plasmodium falciparum) or "pv" (Plasmodium vivax).');

// ---------------------------------------------------------------------------
// malaria-atlas.parasite_rate_survey
// ---------------------------------------------------------------------------

const malariaAtlasParasiteRateSurvey = z
  .object({
    species: speciesField,
    country: countryField
      .optional()
      .describe(
        'ISO3166 alpha-3 country code to filter surveys (e.g. "KEN"). Omit for all countries.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of survey records to return (1-200). Defaults to 50.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// malaria-atlas.case_estimates
// ---------------------------------------------------------------------------

const malariaAtlasCaseEstimates = z
  .object({
    species: speciesField,
    country: countryField.describe(
      'ISO3166 alpha-3 country code to get confirmed case estimates for (e.g. "IDN").',
    ),
    year: z
      .number()
      .int()
      .min(1980)
      .max(2017)
      .optional()
      .describe(
        'Filter to a single calendar year (1980-2017). Omit to return all available years.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of admin1-region/year rows to return (1-500). Defaults to 50.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// malaria-atlas.vector_occurrence
// ---------------------------------------------------------------------------

const malariaAtlasVectorOccurrence = z
  .object({
    country: countryField
      .optional()
      .describe('ISO3166 alpha-3 country code to filter mosquito vector records (e.g. "SDN").'),
    species: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe(
        'Case-insensitive substring match on the Anopheles species name (e.g. "gambiae", "arabiensis").',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of vector occurrence records to return (1-200). Defaults to 50.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// malaria-atlas.country_list
// ---------------------------------------------------------------------------

const malariaAtlasCountryList = z
  .object({
    name: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe('Case-insensitive substring filter on the country name (e.g. "kenya").'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Maximum number of countries to return (1-250). Defaults to 50.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const malariaAtlasSchemas: Record<string, ZodSchema> = {
  'malaria-atlas.parasite_rate_survey': malariaAtlasParasiteRateSurvey,
  'malaria-atlas.case_estimates': malariaAtlasCaseEstimates,
  'malaria-atlas.vector_occurrence': malariaAtlasVectorOccurrence,
  'malaria-atlas.country_list': malariaAtlasCountryList,
};
