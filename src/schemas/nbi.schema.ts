import { z } from 'zod';

const STATE_CODE_DESC =
  'Two-digit FIPS state code (e.g. "06" for California, "48" for Texas, "36" for New York, "17" for Illinois). ' +
  'Leading zero required for single-digit states (e.g. "01" for Alabama).';

export const nbiSchemas: Record<string, z.ZodTypeAny> = {
  'nbi.search': z
    .object({
      state_code: z
        .string()
        .length(2)
        .regex(/^\d{2}$/)
        .describe(STATE_CODE_DESC),
      condition: z
        .enum(['G', 'F', 'P'])
        .optional()
        .describe(
          'Filter by overall bridge condition: G = Good, F = Fair, P = Poor. ' +
            'Omit to return all conditions.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe(
          'Maximum number of bridges to return (1–200, default 50). Sorted by lowest sufficiency rating ascending.',
        ),
    })
    .strip(),

  'nbi.bridge_detail': z
    .object({
      state_code: z
        .string()
        .length(2)
        .regex(/^\d{2}$/)
        .describe(STATE_CODE_DESC),
      structure_number: z
        .string()
        .min(1)
        .max(15)
        .describe(
          'NBI structure number — the unique bridge identifier within the state (e.g. "06 0021", "27 0052"). ' +
            'Obtainable from the structure_number field in nbi.search or nbi.nearby results.',
        ),
    })
    .strip(),

  'nbi.nearby': z
    .object({
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .describe(
          'Center latitude of the search area in decimal degrees (e.g. 37.7749 for San Francisco).',
        ),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .describe(
          'Center longitude of the search area in decimal degrees (e.g. -122.4194 for San Francisco).',
        ),
      radius_miles: z
        .number()
        .min(0.1)
        .max(50)
        .optional()
        .describe(
          'Search radius in miles from the center point (0.1–50, default 10). Larger radii may return up to 100 results.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Maximum number of nearby bridges to return (1–100, default 25). Sorted by lowest sufficiency rating ascending.',
        ),
    })
    .strip(),

  'nbi.condition_stats': z
    .object({
      state_code: z
        .string()
        .length(2)
        .regex(/^\d{2}$/)
        .describe(STATE_CODE_DESC),
    })
    .strip(),
};
