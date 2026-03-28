import { z, type ZodSchema } from 'zod';

const usage = z.object({
  period: z.enum(['1d', '7d', '30d']).optional().default('7d').describe('Time period for usage stats: "1d" (24 hours), "7d" (7 days), or "30d" (30 days). Default: "7d"'),
}).strip();

const tools = z.object({
  sort: z.enum(['cost', 'calls', 'latency']).optional().default('calls').describe('Sort tools by: "cost" (highest spend), "calls" (most used), or "latency" (slowest). Default: "calls"'),
  limit: z.number().int().min(1).max(100).optional().default(20).describe('Max number of tools to return (1-100). Default: 20'),
}).strip();

const timeseries = z.object({
  period: z.enum(['1d', '7d', '30d']).optional().default('7d').describe('Time period: "1d", "7d", or "30d". Default: "7d"'),
  granularity: z.enum(['hour', 'day']).optional().default('day').describe('Time bucket granularity: "hour" or "day". Default: "day"'),
}).strip();

export const accountSchemas: Record<string, ZodSchema> = {
  'account.usage': usage,
  'account.tools': tools,
  'account.timeseries': timeseries,
};
