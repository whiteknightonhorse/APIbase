import { z, type ZodSchema } from 'zod';

const latest = z.object({
  base: z.string().length(3).optional().describe('Base currency code (e.g. "USD", "EUR", "GBP"). Default: USD. Returns rates for 160+ currencies.'),
}).strip();

const convert = z.object({
  from: z.string().length(3).describe('Source currency code (e.g. "USD")'),
  to: z.string().length(3).describe('Target currency code (e.g. "EUR")'),
  amount: z.number().optional().describe('Amount to convert (default 1)'),
}).strip();

export const exchangerateSchemas: Record<string, ZodSchema> = {
  'exchangerate.latest': latest,
  'exchangerate.convert': convert,
};
