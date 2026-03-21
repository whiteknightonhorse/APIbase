import { z, type ZodSchema } from 'zod';
const search = z.object({ name: z.string().min(2).describe('Country name to search (e.g. "United States", "Germany", "Japan")') }).strip();
const byCode = z.object({ code: z.string().min(2).max(3).describe('ISO 3166-1 country code — alpha-2 ("US") or alpha-3 ("USA")') }).strip();
export const restcountriesSchemas: Record<string, ZodSchema> = { 'country.search': search, 'country.by_code': byCode };
