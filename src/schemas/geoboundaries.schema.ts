import { z, type ZodSchema } from 'zod';

const ADM_LEVEL_VALUES = ['ADM0', 'ADM1', 'ADM2', 'ADM3', 'ADM4', 'ADM5'] as const;

const countryField = z
  .string()
  .length(3)
  .describe(
    'ISO 3166-1 alpha-3 country code, uppercase (e.g. "USA", "KEN", "FRA"). ISO2 codes and ' +
      'country names are not accepted by the upstream API.',
  );

const admLevelField = z
  .enum(ADM_LEVEL_VALUES)
  .optional()
  .describe(
    'Administrative boundary level: "ADM0" (country outline), "ADM1" (state/province/region), ' +
      '"ADM2" (county/district), "ADM3"-"ADM5" (finer subdivisions, only available for some ' +
      'countries). Defaults to "ADM0".',
  );

// ---------------------------------------------------------------------------
// geoboundaries.boundary.detail — single country+level metadata record
// ---------------------------------------------------------------------------

const geoboundariesBoundaryDetail = z
  .object({
    country: countryField,
    adm_level: admLevelField,
  })
  .strip();

// ---------------------------------------------------------------------------
// geoboundaries.boundary.list_countries — every country's metadata at one level
// ---------------------------------------------------------------------------

const geoboundariesBoundaryListCountries = z
  .object({
    adm_level: admLevelField,
  })
  .strip();

// ---------------------------------------------------------------------------
// geoboundaries.boundary.available_levels — which ADM0-ADM5 levels exist for a country
// ---------------------------------------------------------------------------

const geoboundariesBoundaryAvailableLevels = z
  .object({
    country: countryField,
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const geoboundariesSchemas: Record<string, ZodSchema> = {
  'geoboundaries.boundary.detail': geoboundariesBoundaryDetail,
  'geoboundaries.boundary.list_countries': geoboundariesBoundaryListCountries,
  'geoboundaries.boundary.available_levels': geoboundariesBoundaryAvailableLevels,
};
