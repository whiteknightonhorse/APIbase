import { z, type ZodSchema } from 'zod';

const baseFilters = z
  .object({
    state_code: z
      .string()
      .optional()
      .describe(
        'Optional 2-letter US state code (e.g. "CA", "NY", "WY"). Comma-separated for multiple ("CA,WY").',
      ),
    park_code: z
      .string()
      .optional()
      .describe(
        'Optional park code (e.g. "yose" Yosemite, "yell" Yellowstone, "grca" Grand Canyon). Comma-separated allowed.',
      ),
    q: z.string().optional().describe('Free-text keyword search.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max records to return (default 10, max 50).'),
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset for stepping through results.'),
  })
  .strip();

export const npsSchemas: Record<string, ZodSchema> = {
  'nps.parks': baseFilters,
  'nps.alerts': baseFilters,
  'nps.campgrounds': baseFilters,
  'nps.things_to_do': baseFilters,
};
