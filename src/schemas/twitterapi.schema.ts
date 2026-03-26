import { z } from 'zod';

const searchSchema = z.object({
  query: z.string().describe('Search query — keywords, hashtags, or advanced operators (e.g. "AI agents", "#crypto", "from:elonmusk")'),
  sort_order: z.enum(['recency', 'relevancy']).optional().describe('Sort order: "recency" for latest first, "relevancy" for most relevant (default recency)'),
  cursor: z.string().optional().describe('Pagination cursor from previous response (for next page of results)'),
}).strip();

const userSchema = z.object({
  username: z.string().optional().describe('Twitter/X username without @ (e.g. "elonmusk", "OpenAI")'),
  user_id: z.string().optional().describe('Twitter/X numeric user ID as alternative to username'),
}).strip();

const followersSchema = z.object({
  username: z.string().describe('Twitter/X username to get followers for (without @)'),
  cursor: z.string().optional().describe('Pagination cursor from previous response'),
}).strip();

const trendingSchema = z.object({
  woeid: z.number().int().optional().describe('Where On Earth ID for location-specific trends (1=worldwide, 23424977=US, 23424975=UK, 23424856=Japan)'),
}).strip();

export const twitterapiSchemas: Record<string, z.ZodSchema> = {
  'twitter.search': searchSchema,
  'twitter.user': userSchema,
  'twitter.followers': followersSchema,
  'twitter.trending': trendingSchema,
};
