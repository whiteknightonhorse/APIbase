import { z, type ZodSchema } from 'zod';

/**
 * e-Stat Statistics Dashboard (dashboard.e-stat.go.jp) API tool schemas (UC-671).
 *
 * All fields have .describe() per Smithery quality requirements.
 * NEVER use empty z.object({}) — every tool has at least one param.
 */

const langField = z
  .enum(['JP', 'EN'])
  .optional()
  .default('EN')
  .describe("Response language: 'EN' (English, default) or 'JP' (Japanese).");

export const estatJapanDashboardSchemas: Record<string, ZodSchema> = {
  'estat-japan-dashboard.get_data': z
    .object({
      indicator_code: z
        .string()
        .describe(
          "20-digit e-Stat Dashboard indicator code, e.g. '0201010000000010000' (total " +
            'population). Comma-separate multiple codes to fetch several series in one call. ' +
            'Discover codes via estat-japan-dashboard.indicator_info or the public catalog at ' +
            'https://dashboard.e-stat.go.jp/.',
        ),
      region_code: z
        .string()
        .optional()
        .describe(
          "Region code to filter by. '00000' = Japan (national total, default upstream " +
            'behaviour if omitted returns all regions the indicator has data for). 5-digit ' +
            "codes '01000'-'47000' are Japanese prefectures (JIS X 0401, e.g. '13000' = Tokyo). " +
            "3-digit codes (e.g. '840') are ISO 3166-1 numeric country codes for international " +
            'comparison indicators. Discover codes via estat-japan-dashboard.region_info.',
        ),
      time_from: z
        .string()
        .optional()
        .describe(
          "Start of the time range, in the indicator's own cycle notation, e.g. '2020CY00' " +
            "(calendar year 2020) or '202101' + '00' -> '20210100' (January 2021 for monthly " +
            'indicators). Check the valid range and cycle in estat-japan-dashboard.indicator_info.',
        ),
      time_to: z
        .string()
        .optional()
        .describe("End of the time range, same notation as time_from, e.g. '2022CY00'."),
      cycle: z
        .string()
        .optional()
        .describe(
          "Filter to one reporting cycle when an indicator publishes more than one, e.g. '1' " +
            "(Month) or '3' (Calendar Year). See the cycle codes returned by " +
            'estat-japan-dashboard.indicator_info for this indicator.',
        ),
      lang: langField,
    })
    .strip(),

  'estat-japan-dashboard.indicator_info': z
    .object({
      indicator_code: z
        .string()
        .describe(
          "20-digit e-Stat Dashboard indicator code to look up, e.g. '0201010000000010000' " +
            '(total population). Returns the indicator name, unit, source survey, valid date ' +
            'range, and cycle codes per regional level — call this BEFORE ' +
            'estat-japan-dashboard.get_data to confirm units and available cycles.',
        ),
      lang: langField,
    })
    .strip(),

  'estat-japan-dashboard.region_info': z
    .object({
      region_code: z
        .string()
        .optional()
        .describe(
          "Region code to look up, e.g. '13000' (Tokyo) or '00000' (Japan). Omit to fetch the " +
            'full region catalog (Japan + prefectures + municipalities + world countries) so ' +
            'you can discover valid codes for estat-japan-dashboard.get_data.',
        ),
      lang: langField,
    })
    .strip(),
};
