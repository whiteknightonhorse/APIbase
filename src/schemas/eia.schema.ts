import { z, type ZodSchema } from 'zod';

const electricity = z
  .object({
    state: z
      .string()
      .length(2)
      .optional()
      .describe(
        'Optional 2-letter US state code (e.g. "CA", "TX", "NY"). If omitted, returns national + all states.',
      ),
    frequency: z
      .enum(['monthly', 'quarterly', 'annual'])
      .optional()
      .describe('Time frequency (default "monthly").'),
    length: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of recent observations to return (default 24, max 500).'),
    start: z
      .string()
      .optional()
      .describe('Earliest period (e.g. "2020-01" monthly, "2020" annual).'),
    end: z.string().optional().describe('Latest period in same format as `start`.'),
  })
  .strip();

const petroleum = z
  .object({
    product: z
      .string()
      .optional()
      .describe(
        'Petroleum product code — e.g. "EPCBRENT" (Brent), "EPCWTI" (WTI), "EPD2D" (No. 2 Diesel), "EPMRR" (Regular Gas).',
      ),
    frequency: z
      .enum(['daily', 'weekly', 'monthly', 'annual'])
      .optional()
      .describe('Time frequency (default "daily" for spot prices).'),
    length: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of recent observations (default 24, max 500).'),
    start: z.string().optional().describe('Earliest period (ISO date or YYYY-MM-DD).'),
    end: z.string().optional().describe('Latest period.'),
  })
  .strip();

const naturalGas = z
  .object({
    state: z.string().length(2).optional().describe('Optional 2-letter US state code.'),
    frequency: z
      .enum(['monthly', 'annual'])
      .optional()
      .describe('Time frequency (default "monthly").'),
    length: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of recent observations (default 24, max 500).'),
    start: z.string().optional().describe('Earliest period.'),
    end: z.string().optional().describe('Latest period.'),
  })
  .strip();

const series = z
  .object({
    series_id: z
      .string()
      .min(1)
      .describe(
        'EIA series ID for the total-energy dataset (e.g. "RNGWHHD" Henry Hub spot, "ELETPUS" total US electricity, "TETCBUS" total energy consumption).',
      ),
    frequency: z
      .enum(['monthly', 'annual'])
      .optional()
      .describe('Time frequency (default "monthly").'),
    length: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of recent observations (default 24, max 500).'),
  })
  .strip();

export const eiaSchemas: Record<string, ZodSchema> = {
  'eia.electricity_retail': electricity,
  'eia.petroleum_spot': petroleum,
  'eia.natural_gas': naturalGas,
  'eia.series': series,
};
