import { z } from 'zod';

/**
 * Zod schemas for the NRC Power Reactor Status adapter (UC-563).
 *
 * All schemas use .strip() and every field has .describe() for Smithery quality.
 */
export const nrcSchemas: Record<string, z.ZodSchema> = {
  'nrc.current_status': z
    .object({
      sort_by: z
        .enum(['name', 'power_asc', 'power_desc'])
        .optional()
        .describe(
          'Sort order for the reactor list. "name" (alphabetical, default), "power_asc" (lowest power first), "power_desc" (highest power first).',
        ),
    })
    .strip(),

  'nrc.reactor_history': z
    .object({
      unit: z
        .string()
        .min(1)
        .describe(
          'Full NRC reactor unit name as it appears in the status report (e.g. "Arkansas Nuclear 1", "Diablo Canyon 2", "Watts Bar 1"). Case-insensitive.',
        ),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe(
          'Number of most-recent days to retrieve (1–365). Defaults to 30. Data is available for the last 365 calendar days.',
        ),
    })
    .strip(),

  'nrc.outages': z
    .object({
      max_power: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe(
          'Maximum power percentage threshold (inclusive, 0–100). Returns reactors at or below this level. Default 99 returns all reactors not at full power (100%). Set to 0 to see only fully-shutdown reactors.',
        ),
    })
    .strip(),

  'nrc.annual_data': z
    .object({
      year: z
        .number()
        .int()
        .min(1999)
        .max(2030)
        .optional()
        .describe(
          'Calendar year for the historical archive (1999–current year). Defaults to the current year. Annual files contain daily snapshots for all ~95 US reactors.',
        ),
      unit: z
        .string()
        .optional()
        .describe(
          'Optional reactor unit name filter (e.g. "Palo Verde 1"). When provided, returns only records for that reactor. Case-insensitive.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe(
          'Maximum number of rows to return (1–1000). Defaults to 200. The full annual file may contain 17K–35K rows.',
        ),
    })
    .strip(),
};
