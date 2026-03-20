import { z, type ZodSchema } from 'zod';

const byCountry = z.object({
  country_code: z.string().length(2).describe('ISO 3166-1 alpha-2 country code (e.g. "US", "GB", "DE", "JP", "BR")'),
  year: z.number().int().min(2000).max(2099).optional().describe('Year (default 2026). Supports 2000-2099.'),
}).strip();

const next = z.object({
  country_code: z.string().length(2).describe('ISO 3166-1 alpha-2 country code (e.g. "US", "FR")'),
}).strip();

export const nagerdateSchemas: Record<string, ZodSchema> = {
  'holidays.by_country': byCountry,
  'holidays.next': next,
};
