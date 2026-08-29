import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// oecd-data.dataflows — search/list OECD statistical dataflows
// ---------------------------------------------------------------------------

const oecdDataDataflows = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Filter dataflows by name or id substring, case-insensitive (e.g. "unemployment", "gdp"). Omit to list all ~1500 available dataflows (capped to 200 results).',
      ),
    agency_id: z
      .string()
      .optional()
      .describe(
        'Filter by OECD directorate agency id substring (e.g. "OECD.SDD.STES" for short-term economic statistics, "OECD.ELS.SAE" for social/employment). Omit to search across all directorates.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// oecd-data.structure — dimensions + valid codes for a dataflow
// ---------------------------------------------------------------------------

const oecdDataStructure = z
  .object({
    agency_id: z
      .string()
      .min(1)
      .describe('OECD directorate agency id, from oecd-data.dataflows (e.g. "OECD.SDD.STES").'),
    dataflow_id: z
      .string()
      .min(1)
      .describe(
        'OECD dataflow id, from oecd-data.dataflows (e.g. "DSD_STES@DF_CLI" for composite leading indicators). Returns the dimension list (e.g. REF_AREA, FREQ, MEASURE) with each dimension\'s valid codes — needed to interpret oecd-data.data results.',
      ),
    version: z
      .string()
      .optional()
      .describe(
        'Dataflow version, from oecd-data.dataflows (e.g. "4.1"). Omit to use the latest version.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// oecd-data.data — observation values for a dataflow
// ---------------------------------------------------------------------------

const oecdDataData = z
  .object({
    agency_id: z
      .string()
      .min(1)
      .describe('OECD directorate agency id, from oecd-data.dataflows (e.g. "OECD.SDD.STES").'),
    dataflow_id: z
      .string()
      .min(1)
      .describe('OECD dataflow id, from oecd-data.dataflows (e.g. "DSD_STES@DF_CLI").'),
    version: z
      .string()
      .optional()
      .describe(
        'Dataflow version, from oecd-data.dataflows (e.g. "4.1"). Omit to use the latest version.',
      ),
    key: z
      .string()
      .optional()
      .describe(
        'SDMX dot-separated dimension filter key in dimension position order (e.g. "USA.M.LI....." for a specific country+frequency+measure). Use "all" (default) to fetch every series unfiltered — combine with oecd-data.structure to build a narrower key.',
      ),
    start_period: z
      .string()
      .optional()
      .describe(
        'Start of period range, e.g. "2020" (annual) or "2020-01" (monthly). Takes precedence over last_n_observations when set.',
      ),
    end_period: z
      .string()
      .optional()
      .describe(
        'End of period range, e.g. "2024" (annual) or "2024-12" (monthly). Takes precedence over last_n_observations when set.',
      ),
    last_n_observations: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Return only the most recent N observations per series (max 100, default 10). Ignored if start_period or end_period is set.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const oecdDataSchemas: Record<string, ZodSchema> = {
  'oecd-data.dataflows': oecdDataDataflows,
  'oecd-data.structure': oecdDataStructure,
  'oecd-data.data': oecdDataData,
};
