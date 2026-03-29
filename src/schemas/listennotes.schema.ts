import { z, type ZodSchema } from 'zod';

const search = z.object({
  q: z.string().min(1).describe('Search query — full-text search across 186M+ podcast episodes and 3.7M+ podcasts (e.g. "artificial intelligence", "startup funding", "true crime")'),
  type: z.enum(['episode', 'podcast']).optional().default('episode').describe('Search type: "episode" (default) searches episode titles/descriptions, "podcast" searches podcast-level metadata'),
  language: z.string().optional().describe('ISO 639-1 language code (e.g. "en", "es", "fr"). Filters results by podcast language'),
  genre_ids: z.string().optional().describe('Comma-separated genre IDs to filter (e.g. "93,127" for Business+Technology). See Listen Notes genre list'),
  sort_by_date: z.boolean().optional().describe('Sort by date (true) or relevance (false, default)'),
  limit: z.number().int().min(1).max(10).optional().default(10).describe('Max results (1-10, default 10)'),
  offset: z.number().int().min(0).optional().describe('Offset for pagination'),
}).strip();

const podcast = z.object({
  id: z.string().min(1).describe('Listen Notes podcast ID (e.g. "4d3fe717742d4963a85562e9f84d8c79"). Get IDs from listennotes.search or listennotes.best'),
}).strip();

const best = z.object({
  genre_id: z.number().int().optional().describe('Genre ID to filter (e.g. 93=Business, 127=Technology, 68=TV & Film, 82=Leisure, 77=Sports). Omit for overall best'),
  page: z.number().int().min(1).optional().default(1).describe('Page number (default 1)'),
}).strip();

export const listennotesSchemas: Record<string, ZodSchema> = {
  'listennotes.search': search,
  'listennotes.podcast': podcast,
  'listennotes.best': best,
};
