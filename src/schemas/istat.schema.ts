import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// istat.dataflows — search/list ISTAT economic/social-statistics dataflows
// ---------------------------------------------------------------------------

const istatDataflows = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Filter dataflows by name or id substring, case-insensitive (e.g. "population", "inflation", "employment", "crops"). Omit to list all ~4900 available dataflows (capped to 200 results).',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// istat.structure — dimensions + valid codes for a dataflow
// ---------------------------------------------------------------------------

const istatStructure = z
  .object({
    dataflow_id: z
      .string()
      .min(1)
      .describe(
        'ISTAT dataflow id, from istat.dataflows (e.g. "101_1015_DF_DCSP_COLTIVAZIONI_1" for crop areas and production). Returns the dimension list (e.g. FREQ, REF_AREA, DATA_TYPE) with each dimension\'s valid codes (capped to 200 per dimension, with a total_codes count) — needed to interpret istat.data results and build a key filter.',
      ),
    version: z
      .string()
      .optional()
      .describe(
        'Dataflow version, from istat.dataflows (e.g. "1.0"). Omit to use the latest version.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// istat.data — observation values for a dataflow
// ---------------------------------------------------------------------------

const istatData = z
  .object({
    dataflow_id: z
      .string()
      .min(1)
      .describe(
        'ISTAT dataflow id, from istat.dataflows (e.g. "101_1015_DF_DCSP_COLTIVAZIONI_1" for crop areas and production).',
      ),
    key: z
      .string()
      .optional()
      .describe(
        'SDMX dot-separated dimension filter key in dimension position order (e.g. "A.IT...." for annual national-level data, all other dimensions unfiltered). Use istat.structure first to see each dimension\'s position and codes — an unscoped "all" key (default) can match thousands of series and return an oversized response.',
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
      .max(20)
      .optional()
      .describe(
        'Return only the most recent N observations per series (max 20, default 5). Ignored if start_period or end_period is set. Kept low because a wide key can already match hundreds of series.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const istatSchemas: Record<string, ZodSchema> = {
  'istat.dataflows': istatDataflows,
  'istat.structure': istatStructure,
  'istat.data': istatData,
};
