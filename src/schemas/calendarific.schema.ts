import { z, type ZodSchema } from 'zod';

const holidays = z.object({
  country: z.string().length(2).describe('ISO 3166-1 alpha-2 country code (e.g. "US", "GB", "DE", "JP", "IN", "BR")'),
  year: z.number().int().min(2000).max(2049).optional().describe('Year (default 2026)'),
  month: z.number().int().min(1).max(12).optional().describe('Filter by month (1-12)'),
  day: z.number().int().min(1).max(31).optional().describe('Filter by day (1-31)'),
  type: z.enum(['national', 'local', 'religious', 'observance']).optional().describe('Filter by holiday type'),
}).strip();

export const calendarificSchemas: Record<string, ZodSchema> = {
  'calendarific.holidays': holidays,
};
