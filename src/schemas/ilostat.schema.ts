import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// ilostat.dataflows — search/list ILOSTAT labor-statistics dataflows
// ---------------------------------------------------------------------------

const ilostatDataflows = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Filter dataflows by name or id substring, case-insensitive (e.g. "unemployment", "wages", "child labour"). Omit to list all ~1200 available dataflows (capped to 200 results).',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// ilostat.structure — dimensions + valid codes for a dataflow
// ---------------------------------------------------------------------------

const ilostatStructure = z
  .object({
    dataflow_id: z
      .string()
      .min(1)
      .describe(
        'ILOSTAT dataflow id, from ilostat.dataflows (e.g. "DF_EMP_TEMP_SEX_AGE_NB" for employment by sex and age). Returns the dimension list (e.g. REF_AREA, FREQ, MEASURE, SEX, AGE) with each dimension\'s valid codes — needed to interpret ilostat.data results and build a key filter.',
      ),
    version: z
      .string()
      .optional()
      .describe(
        'Dataflow version, from ilostat.dataflows (e.g. "1.0"). Omit to use the latest version.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// ilostat.data — observation values for a dataflow
// ---------------------------------------------------------------------------

const ilostatData = z
  .object({
    dataflow_id: z
      .string()
      .min(1)
      .describe(
        'ILOSTAT dataflow id, from ilostat.dataflows (e.g. "DF_EMP_TEMP_SEX_AGE_NB" for employment by sex and age).',
      ),
    key: z
      .string()
      .optional()
      .describe(
        'SDMX dot-separated dimension filter key in dimension position order (e.g. "USA.A....." for a country restricted to United States, all other dimensions unfiltered). Use "all" (default) to fetch every series unfiltered — combine with ilostat.structure to build a narrower key and avoid oversized responses.',
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

export const ilostatSchemas: Record<string, ZodSchema> = {
  'ilostat.dataflows': ilostatDataflows,
  'ilostat.structure': ilostatStructure,
  'ilostat.data': ilostatData,
};
