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
    kind: z
      .enum(['tool', 'merchant'])
      .optional()
      .describe('"merchant" returns shops only and requires intent. Default: tools and shops'),
    include_unavailable: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Include tools currently marked unavailable (cannot be called right now). Default: false',
      ),
  })
  .strip();

// T-0835: apibase.categories takes no arguments; the one optional placeholder follows the
// no-argument convention (opentdb.schema.ts) and is ignored.
const categoriesTool = z
  .object({
    _placeholder: z
      .string()
      .optional()
      .describe(
        'No parameters required: returns every category with its tool count and price range.',
      ),
  })
  .strip();

// T-0837: apibase.describe takes one tool id (or MCP name).
const describeTool = z
  .object({
    tool_id: z
      .string()
      .min(1)
      .max(200)
      .describe(
        'Tool id or MCP name, as returned by apibase.discover (e.g. "apibase.discover" or "apibase.discovery.search")',
      ),
  })
  .strip();

// T-0838: apibase.call. `arguments` is not typed as an object here on purpose: a non-object value
// must reach the apibase.call handler, which refuses it with error_code ARGUMENTS_NOT_OBJECT
// (an SDK schema error would carry no error code and no next step).
const callTool = z
  .object({
    tool_id: z
      .string()
      .min(1)
      .max(200)
      .describe(
        'Tool id or MCP name of the tool to call, as returned by apibase.discover (e.g. "apibase.discover" or "apibase.discovery.search")',
      ),
    arguments: z
      .unknown()
      .optional()
      .describe(
        'JSON object with the arguments of that tool, as its input schema defines them (apibase.describe returns the schema). Use {} for a tool without arguments.',
      ),
  })
  .strip();

export const apibaseSchemas: Record<string, ZodSchema> = {
  'apibase.call': callTool,
  'apibase.categories': categoriesTool,
  'apibase.describe': describeTool,
  'apibase.discover': discoverTool,
};
