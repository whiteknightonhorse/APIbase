import { z, type ZodSchema } from 'zod';

const dataflowsList = z
  .object({
    search: z
      .string()
      .optional()
      .describe(
        'Optional keyword to filter dataflows by code or name (e.g. "gdp", "SDG", "EO_NA"). Leave empty to list all 62 dataflows.',
      ),
  })
  .strip();

const indicators = z
  .object({
    dataflow: z
      .string()
      .min(1)
      .describe(
        'KIDB dataflow code to list indicators for (e.g. "EO_NA" for National Accounts, "PPL_POP" for Population, "MFP_XR" for Exchange Rates, "SDG_01" for SDG No Poverty). Use adbkidb.dataflows_list to discover all 62 codes.',
      ),
  })
  .strip();

const data = z
  .object({
    dataflow: z
      .string()
      .min(1)
      .describe(
        'KIDB dataflow code (e.g. "EO_NA" for National Accounts, "PPL_POP" for Population, "MFP_XR" for Exchange Rates). Use adbkidb.dataflows_list to discover codes, then adbkidb.indicators to find indicator codes within the dataflow.',
      ),
    indicator_codes: z
      .array(z.string().min(1))
      .min(1)
      .max(10)
      .describe(
        'One or more indicator codes within the dataflow (e.g. ["NGDP_XDC"] for GDP at current prices in EO_NA, ["LP_PE_NUM_MOP"] for population in PPL_POP). Use adbkidb.indicators to discover codes. Maximum 10.',
      ),
    economy_codes: z
      .array(z.string().min(2).max(3))
      .min(1)
      .max(10)
      .describe(
        'One or more ADB economy codes (e.g. ["PRC"] for China, ["IND"] for India, ["JPN"] for Japan, ["PRC","IND","INO"] for multiple). Use adbkidb.economies to list all 50 codes. Maximum 10.',
      ),
    start_year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe(
        'Start year for the data range (e.g. 2010). Data availability varies by indicator; most series begin 1990–2000. Defaults to 2000.',
      ),
    end_year: z
      .number()
      .int()
      .min(1960)
      .max(2030)
      .optional()
      .describe(
        'End year for the data range (e.g. 2024). Defaults to current year. Annual frequency only (A).',
      ),
  })
  .strip();

const economies = z
  .object({
    search: z
      .string()
      .optional()
      .describe(
        'Optional keyword to filter ADB member economies by code or name (e.g. "india", "PRC", "south"). Leave empty to list all 50 ADB member economies with their 3-letter codes.',
      ),
  })
  .strip();

export const adbkidbSchemas: Record<string, ZodSchema> = {
  'adbkidb.dataflows_list': dataflowsList,
  'adbkidb.indicators': indicators,
  'adbkidb.data': data,
  'adbkidb.economies': economies,
};
