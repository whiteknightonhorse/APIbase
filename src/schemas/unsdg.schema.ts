import { z, type ZodSchema } from 'zod';

const goalsList = z
  .object({
    locale: z
      .string()
      .optional()
      .describe(
        'Response locale code (e.g. "en" for English, "fr" for French). Defaults to English. Currently only English is supported by the UN SDG API.',
      ),
  })
  .strip();

const targetsList = z
  .object({
    goal: z
      .string()
      .optional()
      .describe(
        'Filter by SDG goal number (e.g. "1" for No Poverty, "13" for Climate Action). If omitted, all 169 targets across all 17 goals are returned.',
      ),
  })
  .strip();

const indicatorsList = z
  .object({
    goal: z
      .string()
      .optional()
      .describe(
        'Filter indicators by SDG goal number (e.g. "1", "3", "13"). If omitted, all 231 indicators across all 17 goals are returned.',
      ),
    target: z
      .string()
      .optional()
      .describe(
        'Filter indicators by target code (e.g. "1.1", "3.3", "13.2"). Requires goal to be set for best results.',
      ),
  })
  .strip();

const dataQuery = z
  .object({
    series_code: z
      .string()
      .describe(
        'UN SDG series code to query (e.g. "SI_POV_DAY1" for poverty rate, "SH_STA_MORT" for maternal mortality, "EN_ATM_CO2" for CO2 emissions). Obtain series codes from unsdg.indicators.list.',
      ),
    geo_area_code: z
      .string()
      .optional()
      .describe(
        'UN M49 numeric geo area code to filter by country or region (e.g. "356" for India, "840" for USA, "076" for Brazil). Use unsdg.geo.countries to look up codes.',
      ),
    start_year: z
      .number()
      .int()
      .min(1990)
      .max(2030)
      .optional()
      .describe(
        'Filter data records starting from this year (e.g. 2010). Combined with end_year to define a time range.',
      ),
    end_year: z
      .number()
      .int()
      .min(1990)
      .max(2030)
      .optional()
      .describe(
        'Filter data records up to and including this year (e.g. 2023). Combined with start_year to define a time range.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Maximum number of records to return per page (1-200, default 50). Large series may have thousands of records across countries and years.',
      ),
  })
  .strip();

const geoCountries = z
  .object({
    filter: z
      .string()
      .optional()
      .describe(
        'Optional substring to filter country/region names (case-insensitive, e.g. "Africa", "Asia", "Latin"). If omitted, all 460 geo areas are returned.',
      ),
  })
  .strip();

export const unsdgSchemas: Record<string, ZodSchema> = {
  'unsdg.goals.list': goalsList,
  'unsdg.targets.list': targetsList,
  'unsdg.indicators.list': indicatorsList,
  'unsdg.data.query': dataQuery,
  'unsdg.geo.countries': geoCountries,
};
