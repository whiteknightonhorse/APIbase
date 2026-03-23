import { z, type ZodSchema } from 'zod';

const searchPosts = z.object({
  q: z.string().min(1).describe('Search query for Bluesky posts (e.g. "MCP server", "AI agents", "Claude")'),
  limit: z.number().int().min(1).max(100).optional().describe('Max results (default 25, max 100)'),
  sort: z.enum(['top', 'latest']).optional().describe('Sort order: "top" (relevance) or "latest" (chronological)'),
  lang: z.string().optional().describe('Filter by language code (e.g. "en", "ja", "pt")'),
}).strip();

const profile = z.object({
  handle: z.string().min(3).describe('Bluesky handle (e.g. "jay.bsky.team", "pfrazee.com", "apibase.bsky.social")'),
}).strip();

const feed = z.object({
  handle: z.string().min(3).describe('Bluesky handle to get posts from (e.g. "jay.bsky.team")'),
  limit: z.number().int().min(1).max(100).optional().describe('Number of posts to return (default 20, max 100)'),
}).strip();

export const blueskySchemas: Record<string, ZodSchema> = {
  'bluesky.search_posts': searchPosts,
  'bluesky.profile': profile,
  'bluesky.feed': feed,
};
