import { z, type ZodSchema } from 'zod';

const toolQuality = z.object({
  tool_id: z.string().min(1).describe('Tool ID to get quality metrics for (e.g. "crypto.get_price", "weather.get_current")'),
}).strip();

const toolRankings = z.object({
  sort: z.enum(['uptime', 'latency', 'error_rate']).optional().default('uptime').describe('Sort by: "uptime" (highest availability), "latency" (fastest p50), or "error_rate" (lowest errors). Default: "uptime"'),
  limit: z.number().int().min(1).max(100).optional().default(20).describe('Max number of tools to return (1-100). Default: 20'),
  category: z.string().optional().describe('Filter by tool category prefix (e.g. "crypto", "weather", "finance")'),
}).strip();

const callBatch = z.object({
  calls: z.array(z.object({
    tool_id: z.string().min(1).describe('Tool ID to call (e.g. "crypto.get_price")'),
    params: z.record(z.unknown()).describe('Parameters for the tool call'),
    idempotency_key: z.string().optional().describe('Optional idempotency key for this specific call'),
  })).min(1).max(20).describe('Array of tool calls to execute in parallel (max 20)'),
  max_parallel: z.number().int().min(1).max(10).optional().default(10).describe('Max concurrent calls (1-10). Default: 10'),
}).strip();

export const platformSchemas: Record<string, ZodSchema> = {
  'platform.tool_quality': toolQuality,
  'platform.tool_rankings': toolRankings,
  'platform.call_batch': callBatch,
};
