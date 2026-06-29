import { z } from 'zod';

export const comtradeSchemas: Record<string, z.ZodTypeAny> = {
  'comtrade.trade_data': z
    .object({
      reporter_code: z
        .number()
        .int()
        .describe(
          'UN numeric code for the reporting country (e.g. 276=Germany, 840=USA, 156=China, 826=UK). ' +
            'Use comtrade.reporters to look up codes.',
        ),
      period: z
        .string()
        .describe(
          'Reference period to query. Annual: 4-digit year (e.g. "2022"). ' +
            'Monthly: YYYYMM (e.g. "202209" for Sep 2022). ' +
            'Comma-separated for multiple periods (e.g. "2020,2021,2022").',
        ),
      flow_code: z
        .enum(['M', 'X', 'MX', 'RM', 'RX'])
        .describe(
          'Trade flow direction. M=Imports, X=Exports, MX=Both imports and exports, ' +
            'RM=Re-imports, RX=Re-exports.',
        ),
      cmd_code: z
        .string()
        .optional()
        .describe(
          'Commodity code filter. Use HS codes (e.g. "84" for machinery, "27" for petroleum, ' +
            '"TOTAL" for aggregate totals, "AG2" for all 2-digit chapters). ' +
            'Omit to return all commodities (may be large). Default: TOTAL.',
        ),
      partner_code: z
        .number()
        .int()
        .optional()
        .describe(
          'UN numeric code for the partner country. 0=World aggregate (all partners combined). ' +
            'Omit to return all individual partners.',
        ),
      type_code: z
        .enum(['C', 'S'])
        .optional()
        .describe('Trade data type. C=Commodities (default), S=Services.'),
      freq_code: z
        .enum(['A', 'M'])
        .optional()
        .describe('Frequency. A=Annual (default), M=Monthly.'),
      classification: z
        .enum(['HS', 'B4', 'B5', 'EB', 'S1', 'S2', 'S3', 'S4', 'SS'])
        .optional()
        .describe(
          'Commodity classification system. HS=Harmonized System (default, most common). ' +
            'B4/B5=BEC, EB=EBOPS services, S1-S4/SS=SITC revisions.',
        ),
      max_records: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe(
          'Maximum number of records to return (1–500). Default 100. ' +
            'The public preview API is capped at 500 records per request.',
        ),
      partner2_code: z
        .number()
        .int()
        .optional()
        .describe(
          'Secondary partner code for extended trade flow tracking (consignment country). ' +
            '0=World aggregate. Omit to use the default world aggregate.',
        ),
      customs_code: z
        .string()
        .optional()
        .describe(
          'Customs procedure code filter (e.g. "C00"=all procedures, "C03"=outright export, ' +
            '"C04"=warehousing). Omit for all procedures.',
        ),
      aggregate_by: z
        .string()
        .optional()
        .describe(
          'Aggregate results by a dimension. Valid values: "cmdCode", "flowCode", "partnerCode", ' +
            '"reporterCode", "period". Omit to return unaggregated records.',
        ),
    })
    .strip(),

  'comtrade.availability': z
    .object({
      reporter_code: z
        .number()
        .int()
        .optional()
        .describe(
          'UN numeric code for the reporting country to check. Omit to list all available reporters. ' +
            'Example: 276=Germany, 840=USA, 156=China.',
        ),
      period: z
        .string()
        .optional()
        .describe(
          'Filter by reference period. Annual: 4-digit year (e.g. "2022"). ' +
            'Monthly: YYYYMM (e.g. "202209"). Omit to list all available periods.',
        ),
      flow_code: z
        .enum(['M', 'X', 'MX', 'RM', 'RX'])
        .optional()
        .describe('Filter by trade flow: M=Imports, X=Exports, MX=Both. Omit for all flows.'),
      cmd_code: z
        .string()
        .optional()
        .describe('Filter by commodity code (e.g. "84", "TOTAL"). Omit for all commodities.'),
      type_code: z
        .enum(['C', 'S'])
        .optional()
        .describe('Data type. C=Commodities (default), S=Services.'),
      freq_code: z
        .enum(['A', 'M'])
        .optional()
        .describe('Frequency. A=Annual (default), M=Monthly.'),
      classification: z
        .enum(['HS', 'B4', 'B5', 'EB', 'S1', 'S2', 'S3', 'S4', 'SS'])
        .optional()
        .describe('Classification system. HS=Harmonized System (default).'),
    })
    .strip(),

  'comtrade.metadata': z
    .object({
      reporter_code: z
        .number()
        .int()
        .describe(
          'UN numeric code for the reporting country. Example: 276=Germany, 840=USA, 156=China. ' +
            'Use comtrade.reporters to look up codes.',
        ),
      period: z
        .string()
        .describe(
          'Reference period. Annual: 4-digit year (e.g. "2022"). Monthly: YYYYMM (e.g. "202209"). ' +
            'Returns currency conversion factors, trade system, valuation notes for this dataset.',
        ),
      type_code: z
        .enum(['C', 'S'])
        .optional()
        .describe('Data type. C=Commodities (default), S=Services.'),
      freq_code: z
        .enum(['A', 'M'])
        .optional()
        .describe('Frequency. A=Annual (default), M=Monthly.'),
      classification: z
        .enum(['HS', 'B4', 'B5', 'EB', 'S1', 'S2', 'S3', 'S4', 'SS'])
        .optional()
        .describe('Classification system. HS=Harmonized System (default).'),
      show_history: z
        .boolean()
        .optional()
        .describe(
          'Include historical revisions in the metadata response. ' +
            'Default false (returns only the latest version).',
        ),
    })
    .strip(),

  'comtrade.reporters': z
    .object({
      search: z
        .string()
        .optional()
        .describe(
          'Filter reporters by name or ISO code (case-insensitive substring match). ' +
            'Examples: "germany", "DEU", "united states". Omit to return all reporters.',
        ),
      include_groups: z
        .boolean()
        .optional()
        .describe(
          'Include aggregate groups (e.g. "EU", "World") in results. ' +
            'Default true. Set to false to return only individual countries.',
        ),
    })
    .strip(),
};
