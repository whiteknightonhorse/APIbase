import { z, type ZodSchema } from 'zod';

/**
 * UNESCO Institute for Statistics (UIS) Data API tool schemas (UC-673).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

const themeField = z
  .enum(['EDUCATION', 'SCIENCE_TECHNOLOGY_INNOVATION', 'CULTURE', 'DEMOGRAPHIC_SOCIOECONOMIC'])
  .optional()
  .describe(
    'Filter to one UIS theme: EDUCATION, SCIENCE_TECHNOLOGY_INNOVATION, CULTURE, or ' +
      'DEMOGRAPHIC_SOCIOECONOMIC. Omit to search across all themes.',
  );

const geoUnitTypeField = z
  .enum(['NATIONAL', 'REGIONAL'])
  .optional()
  .describe('Filter to one geo unit level: NATIONAL (countries) or REGIONAL (world regions).');

export const unescoDataSchemas: Record<string, ZodSchema> = {
  'unesco-data.indicator_search': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          "Case-insensitive substring to match against indicator name or code, e.g. 'literacy' " +
            "or 'LR.AG15T24'. Omit to browse by theme alone.",
        ),
      theme: themeField,
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Max number of matching indicators to return (default 50, max 200). The UIS catalog ' +
            'has ~5,063 indicators total — narrow with query/theme before raising this.',
        ),
    })
    .strip()
    .describe(
      'Search the UNESCO Institute for Statistics indicator catalog (education, science & ' +
        'technology, culture, and demographic/socioeconomic indicators) by name, code, or ' +
        'theme. Call this first to find a valid indicator_code for unesco-data.get_data.',
    ),

  'unesco-data.geounit_list': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          "Case-insensitive substring to match against country/region name, e.g. 'Kenya' or " +
            "'Africa'.",
        ),
      type: geoUnitTypeField,
    })
    .strip()
    .describe(
      'List the 462 country/region codes (NATIONAL and REGIONAL) recognized by the UIS Data ' +
        'API. Call this to find a valid geo_unit code for unesco-data.get_data.',
    ),

  'unesco-data.get_data': z
    .object({
      indicator: z
        .union([z.string(), z.array(z.string())])
        .describe(
          'One or two UIS indicator codes (comma-separated string or array), e.g. ' +
            "'LR.AG15T24' (youth literacy rate). Discover codes via unesco-data.indicator_search.",
        ),
      geo_unit: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "One or more 3-letter geo unit codes (comma-separated string or array), e.g. 'IND' " +
            "or 'KEN,NGA'. Omit to return data for every country/region the indicator covers " +
            '(can be large — prefer narrowing with start/end too). Discover codes via ' +
            'unesco-data.geounit_list.',
        ),
      geo_unit_type: geoUnitTypeField,
      start: z
        .number()
        .int()
        .optional()
        .describe('Start year (inclusive), e.g. 2015. Omit for the full available history.'),
      end: z
        .number()
        .int()
        .optional()
        .describe('End year (inclusive), e.g. 2022. Omit for the full available history.'),
      footnotes: z
        .boolean()
        .optional()
        .describe('Include per-record footnotes (data source caveats) in the response.'),
      indicator_metadata: z
        .boolean()
        .optional()
        .describe(
          'Include full indicator metadata (definition, calculation method, data source) ' +
            'alongside the records.',
        ),
    })
    .strip()
    .describe(
      'Fetch time-series values for 1-2 UNESCO UIS indicator codes, optionally filtered by ' +
        'geo unit and year range. Always call unesco-data.indicator_search first to confirm a ' +
        'valid indicator code.',
    ),
};
