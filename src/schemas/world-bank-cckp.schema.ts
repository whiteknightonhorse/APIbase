import { z, type ZodSchema } from 'zod';

const countryField = z
  .string()
  .min(1)
  .describe(
    'Geography code: ISO3166 alpha-3 country code (e.g. "BRA", "USA", "IND"), or a special ' +
      'aggregate code such as "all_countries" (every country in one call) or "region_SAS" ' +
      '(South Asia region, admin1-level breakdown included — replace SAS with any World Bank ' +
      'region code).',
  );

const aggregationField = z
  .enum(['annual', 'monthly', 'seasonal'])
  .optional()
  .describe(
    'Time aggregation of the returned values. "annual" returns one value per year, "monthly" ' +
      'returns 12 values per year, "seasonal" returns 4 values per year (DJF/MAM/JJA/SON). ' +
      'Defaults to "annual".',
  );

// ---------------------------------------------------------------------------
// world-bank-cckp.climate_normal — historical baseline climatology
// ---------------------------------------------------------------------------

const worldBankCckpClimateNormal = z
  .object({
    variable: z
      .enum(['tas', 'tasmax', 'tasmin', 'pr'])
      .describe(
        'Climate variable: "tas" (mean near-surface air temperature, °C), "tasmax" (mean daily ' +
          'maximum temperature, °C), "tasmin" (mean daily minimum temperature, °C), "pr" ' +
          '(precipitation, mm).',
      ),
    country: countryField,
    aggregation: aggregationField,
  })
  .strip();

// ---------------------------------------------------------------------------
// world-bank-cckp.climate_projection — CMIP6 SSP scenario projection
// ---------------------------------------------------------------------------

const worldBankCckpClimateProjection = z
  .object({
    variable: z
      .enum(['tas', 'tasmax', 'tasmin', 'pr'])
      .describe(
        'Climate variable: "tas" (mean near-surface air temperature, °C), "tasmax" (mean daily ' +
          'maximum temperature, °C), "tasmin" (mean daily minimum temperature, °C), "pr" ' +
          '(precipitation, mm).',
      ),
    country: countryField,
    scenario: z
      .enum(['ssp126', 'ssp245', 'ssp370', 'ssp585'])
      .describe(
        'CMIP6 Shared Socioeconomic Pathway emission scenario: "ssp126" (low emissions, ' +
          'strong mitigation), "ssp245" (intermediate emissions), "ssp370" (high emissions), ' +
          '"ssp585" (very high emissions, fossil-fuel-intensive).',
      ),
    period: z
      .enum(['2020-2039', '2040-2059', '2060-2079', '2080-2099'])
      .optional()
      .describe('Future 20-year projection window. Defaults to "2040-2059".'),
    aggregation: aggregationField,
  })
  .strip();

// ---------------------------------------------------------------------------
// world-bank-cckp.extreme_indices — derived extreme-climate index
// ---------------------------------------------------------------------------

const worldBankCckpExtremeIndices = z
  .object({
    index: z
      .enum(['hd35', 'hd40', 'fd', 'cdd', 'cwd', 'r20mm', 'tr23'])
      .describe(
        'Extreme-climate index: "hd35"/"hd40" (annual count of days with max temp > 35°C/40°C), ' +
          '"fd" (frost days, min temp < 0°C), "cdd" (max consecutive dry days, precip < 1mm), ' +
          '"cwd" (max consecutive wet days, precip >= 1mm), "r20mm" (days with precip > 20mm), ' +
          '"tr23" (tropical nights, min temp > 23°C).',
      ),
    country: countryField,
    scenario: z
      .enum(['historical', 'ssp126', 'ssp245', 'ssp370', 'ssp585'])
      .optional()
      .describe(
        '"historical" (default) returns the 1995-2014 observed baseline. A CMIP6 SSP scenario ' +
          '("ssp126"/"ssp245"/"ssp370"/"ssp585") returns a future projection for the period below.',
      ),
    period: z
      .enum(['2020-2039', '2040-2059', '2060-2079', '2080-2099'])
      .optional()
      .describe(
        'Future 20-year projection window, only used when scenario is not "historical". ' +
          'Defaults to "2040-2059".',
      ),
    aggregation: aggregationField,
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const worldBankCckpSchemas: Record<string, ZodSchema> = {
  'world-bank-cckp.climate_normal': worldBankCckpClimateNormal,
  'world-bank-cckp.climate_projection': worldBankCckpClimateProjection,
  'world-bank-cckp.extreme_indices': worldBankCckpExtremeIndices,
};
