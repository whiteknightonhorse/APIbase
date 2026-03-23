import { z, type ZodSchema } from 'zod';

const search = z.object({
  name: z.string().min(1).describe('Legal entity name to search (e.g. "Apple", "Goldman Sachs", "Toyota Motor")'),
  limit: z.number().int().min(1).max(100).optional().describe('Max results (default 10, max 100)'),
  country: z.string().length(2).optional().describe('Filter by ISO 3166-1 alpha-2 country code (e.g. "US", "GB", "JP", "DE")'),
}).strip();

const lookup = z.object({
  lei: z.string().length(20).describe('20-character Legal Entity Identifier code (e.g. "HWUPKR0MPOU8FGXBT394" for Apple Inc)'),
}).strip();

const relationships = z.object({
  lei: z.string().length(20).describe('LEI code to find parent company relationship for'),
}).strip();

export const gleifSchemas: Record<string, ZodSchema> = {
  'lei.search': search,
  'lei.lookup': lookup,
  'lei.relationships': relationships,
};
