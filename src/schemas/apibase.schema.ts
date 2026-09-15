import { z, type ZodSchema } from 'zod';

// ZZ-03-05: input schema for the `apibase.discover` MCP tool. Every field optional — an empty
// call is valid (browse the whole active catalog, ranked by quality/price, capped at `limit`).
const discoverTool = z
  .object({
    intent: z
      .string()
      .optional()
      .describe('Free-text description of the task, e.g. "find current hotel prices in Tokyo"'),
    category: z
      .string()
      .optional()
      .describe(
        'Filter by category (one of TOOL_DEFINITIONS[].category — see apibase.discover results for valid values)',
      ),
    max_price_usd: z
      .number()
      .min(0)
      .optional()
      .describe('Only return tools priced at or below this amount (USD)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe('Max number of results (1-50). Default: 10'),
    include_unavailable: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Include tools currently marked unavailable (cannot be called right now). Default: false',
      ),
  })
  .strip();

export const apibaseSchemas: Record<string, ZodSchema> = {
  'apibase.discover': discoverTool,
};
