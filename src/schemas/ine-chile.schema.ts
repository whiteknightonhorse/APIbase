import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// ine-chile.dataflows — search/list SIMEL labour-market indicator dataflows
// ---------------------------------------------------------------------------

const ineChileDataflows = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Filter dataflows by name or id substring, case-insensitive (e.g. "desocup" for unemployment, "sexo" for gender-split indicators). Omit to list all ~204 available dataflows.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// ine-chile.structure — dimensions + valid codes for a dataflow
// ---------------------------------------------------------------------------

const ineChileStructure = z
  .object({
    dataflow_id: z
      .string()
      .min(1)
      .describe(
        'SIMEL dataflow id, from ine-chile.dataflows (e.g. "DF_NOCU_SEXO"). Returns the dimension list (e.g. AREA_REF, FREQ, INDICADOR, SEXO) with each dimension\'s valid codes — needed to interpret ine-chile.data results.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// ine-chile.data — observation values for a dataflow
// ---------------------------------------------------------------------------

const ineChileData = z
  .object({
    dataflow_id: z
      .string()
      .min(1)
      .describe('SIMEL dataflow id, from ine-chile.dataflows (e.g. "DF_NOCU_SEXO").'),
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

export const ineChileSchemas: Record<string, ZodSchema> = {
  'ine-chile.dataflows': ineChileDataflows,
  'ine-chile.structure': ineChileStructure,
  'ine-chile.data': ineChileData,
};
