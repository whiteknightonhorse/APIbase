import { z } from 'zod';

export const wtoSchemas: Record<string, z.ZodTypeAny> = {
  'wto.trade_data': z
    .object({
      indicator_codes: z
        .string()
        .describe(
          'Comma-separated WTO indicator code(s) to retrieve data for. ' +
            'Examples: "TP_A_0010" (MFN applied tariff, all products), ' +
            '"ITS_MTV_AX" (merchandise exports by product group, annual), ' +
            '"ITS_CS_AX6" (commercial services exports by sector). ' +
            'Use wto.trade.indicators to discover available codes.',
        ),
      reporter_codes: z
        .string()
        .describe(
          'Comma-separated WTO reporter economy code(s). ' +
            'Use the 3-digit numeric codes from wto.trade.reporters — e.g. "840" for USA, ' +
            '"276" for Germany, "156" for China, "392" for Japan, "000" for World aggregate. ' +
            'Multiple codes accepted (e.g. "840,276,156").',
        ),
      years: z
        .string()
        .optional()
        .describe(
          'Comma-separated year(s) or year-ranges to retrieve (e.g. "2022", "2020,2021,2022", ' +
            '"2015-2022"). Omit to get all available years for the indicator. ' +
            'Most tariff/trade indicators cover 2005–2024.',
        ),
      partner_codes: z
        .string()
        .optional()
        .describe(
          'Comma-separated partner economy code(s) for bilateral trade data. ' +
            'Only applicable to indicators that have partner dimension (bilateral trade flows). ' +
            'Use "000" for world total. Omit for indicators without partner dimension (e.g. tariffs).',
        ),
      max_rows: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe(
          'Maximum number of data rows to return (1–500, default 100). ' +
            'Lower values are faster; raise for multi-year/multi-country queries.',
        ),
    })
    .strip(),

  'wto.indicators': z
    .object({
      topic_id: z
        .number()
        .int()
        .optional()
        .describe(
          'Filter indicators by WTO topic ID (1–N). Use wto.trade.topics to list topic IDs. ' +
            'Example: topic 3 = World Tariff Profiles. Omit to list all 58+ indicators.',
        ),
      category: z
        .string()
        .optional()
        .describe(
          'Filter indicators by category code. Known values: "TAR" (tariff profiles), ' +
            '"ITS_M" (merchandise trade values/indices), "ITS_S" (commercial services trade). ' +
            'Omit to return all categories.',
        ),
    })
    .strip(),

  'wto.reporters': z
    .object({
      filter: z
        .string()
        .optional()
        .describe(
          'Optional case-insensitive substring to filter reporters by name (e.g. "European", ' +
            '"Africa", "United"). Applied client-side — returns full list if omitted (288 economies).',
        ),
    })
    .strip(),

  'wto.topics': z
    .object({
      locale: z
        .string()
        .optional()
        .describe(
          'Response language. Currently only English is supported by the WTO API (lang=1). ' +
            'Reserved for future use; leave unset.',
        ),
    })
    .strip(),
};
