import { z, type ZodSchema } from 'zod';

const search = z.object({
  query: z.string().min(1).describe('Search term (e.g. "Rembrandt", "Mona Lisa", "medieval manuscript", "Art Nouveau poster")'),
  rows: z.number().int().min(1).max(100).optional().describe('Number of results to return (default 12, max 100)'),
  start: z.number().int().min(1).optional().describe('Start position for pagination (default 1)'),
  media: z.boolean().optional().describe('Only return items with media (images/video/audio) — default false'),
  country: z.string().optional().describe('Filter by country (e.g. "Netherlands", "France", "Italy", "Germany")'),
}).strip();

const record = z.object({
  id: z.string().min(1).describe('Europeana record ID from search results (e.g. "/09102/_GNM_693983" or "09102/_GNM_693983")'),
}).strip();

export const europeanaSchemas: Record<string, ZodSchema> = {
  'europeana.search': search,
  'europeana.record': record,
};
