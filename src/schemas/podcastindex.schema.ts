import { z, type ZodSchema } from 'zod';

const search = z.object({
  q: z.string().min(2).describe('Search term or phrase (e.g. "artificial intelligence", "Lex Fridman", "true crime")'),
  max: z.number().int().min(1).max(100).optional().describe('Max results to return (default 20, max 100)'),
  lang: z.string().optional().describe('Filter by language code (e.g. "en", "de", "es", "ja")'),
  cat: z.string().optional().describe('Filter by category name (e.g. "Technology", "News", "Comedy", "Business")'),
}).strip();

const trending = z.object({
  max: z.number().int().min(1).max(100).optional().describe('Number of trending podcasts (default 20, max 100)'),
  lang: z.string().optional().describe('Filter by language code (e.g. "en")'),
  cat: z.string().optional().describe('Filter by category (e.g. "Technology", "News")'),
  since: z.number().int().optional().describe('Unix timestamp — only include podcasts with new episodes since this time'),
}).strip();

const episodes = z.object({
  id: z.number().int().describe('PodcastIndex feed ID (from search or trending results)'),
  max: z.number().int().min(1).max(100).optional().describe('Number of episodes to return (default 20, max 100)'),
  since: z.number().int().optional().describe('Unix timestamp — only return episodes published after this time'),
}).strip();

const byFeed = z.object({
  id: z.number().int().describe('PodcastIndex feed ID to retrieve full metadata for'),
}).strip();

export const podcastindexSchemas: Record<string, ZodSchema> = {
  'podcast.search': search,
  'podcast.trending': trending,
  'podcast.episodes': episodes,
  'podcast.by_feed': byFeed,
};
