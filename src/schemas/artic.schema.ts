import { z, type ZodSchema } from 'zod';

const search = z.object({
  q: z.string().min(1).describe('Search query for artworks (e.g. "monet water lilies", "picasso", "impressionism", "Japanese woodblock")'),
  limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 10, max 100)'),
  page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
}).strip();

const artwork = z.object({
  id: z.number().int().describe('ARTIC artwork ID from search results (e.g. 16568 for Monet Water Lilies)'),
}).strip();

const artist = z.object({
  q: z.string().min(1).describe('Artist name to search (e.g. "Claude Monet", "Picasso", "Georgia O\'Keeffe")'),
  limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 10, max 100)'),
}).strip();

export const articSchemas: Record<string, ZodSchema> = {
  'artic.search': search,
  'artic.artwork': artwork,
  'artic.artist': artist,
};
