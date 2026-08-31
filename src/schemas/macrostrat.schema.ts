import { z, type ZodSchema } from 'zod';

const columnsSearch = z
  .object({
    lat: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe('Decimal degree latitude (WGS84) — must be supplied together with lng'),
    lng: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe('Decimal degree longitude (WGS84) — must be supplied together with lat'),
    adjacents: z
      .boolean()
      .optional()
      .describe('If lat+lng given, also return columns touching the same polygon (default false)'),
    strat_name: z
      .string()
      .optional()
      .describe('Fuzzy stratigraphic name to match, e.g. "mancos" or "jordan"'),
    interval_name: z
      .string()
      .optional()
      .describe('Chronostratigraphic time interval name, e.g. "Permian" or "Cretaceous"'),
    lith: z
      .string()
      .optional()
      .describe('Lithology name to filter by, e.g. "sandstone" or "shale"'),
    age: z.number().optional().describe('Numerical age in millions of years before present (Ma)'),
    age_top: z
      .number()
      .optional()
      .describe('Younger bound of an age range in Ma — must be used with age_bottom'),
    age_bottom: z
      .number()
      .optional()
      .describe('Older bound of an age range in Ma — must be used with age_top'),
  })
  .strip()
  .describe(
    'At least one filter required: lat+lng, strat_name, interval_name, lith, age, or age_top+age_bottom',
  );

const unitsSearch = z
  .object({
    col_id: z
      .number()
      .int()
      .optional()
      .describe('Macrostrat column ID (from macrostrat.columns_search) to list rock units for'),
    lat: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe('Decimal degree latitude (WGS84) — must be supplied together with lng'),
    lng: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe('Decimal degree longitude (WGS84) — must be supplied together with lat'),
  })
  .strip()
  .describe('Requires either col_id, or lat+lng together');

const geologicMapUnits = z
  .object({
    lat: z.number().min(-90).max(90).describe('Decimal degree latitude (WGS84)'),
    lng: z.number().min(-180).max(180).describe('Decimal degree longitude (WGS84)'),
    scale: z
      .enum(['small', 'medium', 'large'])
      .optional()
      .describe('Geologic map source scale (default returns the best-available match)'),
  })
  .strip();

const fossilsSearch = z
  .object({
    col_id: z
      .number()
      .int()
      .optional()
      .describe(
        'Macrostrat column ID (from macrostrat.columns_search) to find fossil collections in',
      ),
    unit_id: z
      .number()
      .int()
      .optional()
      .describe('Macrostrat unit ID (from macrostrat.units_search) to find fossil collections in'),
    interval_name: z
      .string()
      .optional()
      .describe(
        'Optional chronostratigraphic interval name to further narrow results within col_id/unit_id',
      ),
  })
  .strip()
  .describe('Requires either col_id or unit_id');

export const macrostratSchemas: Record<string, ZodSchema> = {
  'macrostrat.columns_search': columnsSearch,
  'macrostrat.units_search': unitsSearch,
  'macrostrat.geologic_map_units': geologicMapUnits,
  'macrostrat.fossils_search': fossilsSearch,
};
