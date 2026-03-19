import { z, type ZodSchema } from 'zod';

const trending = z.object({
  limit: z.number().int().min(1).max(40).optional().describe('Number of trending posts to return (default 10, max 40)'),
}).strip();

const trendingTags = z.object({
  limit: z.number().int().min(1).max(20).optional().describe('Number of trending hashtags to return (default 10, max 20)'),
}).strip();

export const mastodonSchemas: Record<string, ZodSchema> = {
  'mastodon.trending': trending,
  'mastodon.trending_tags': trendingTags,
};
