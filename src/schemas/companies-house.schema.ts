import { z, type ZodSchema } from 'zod';

const search = z.object({
  query: z.string().min(1).describe('Company name to search (e.g. "Barclays", "Tesco", "ARM Holdings")'),
  limit: z.number().int().min(1).max(100).optional().describe('Max results (default 10, max 100)'),
}).strip();

const details = z.object({
  company_number: z.string().min(1).describe('UK Companies House number (e.g. "00048839" for Barclays, "00445790" for Tesco). Get from search results'),
}).strip();

export const companiesHouseSchemas: Record<string, ZodSchema> = {
  'ukcompany.search': search,
  'ukcompany.details': details,
};
