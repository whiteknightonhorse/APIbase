import { z } from 'zod';

export const hnalgoliaSchemas: Record<string, z.ZodTypeAny> = {
  'hnalgolia.search': z
    .object({
      query: z
        .string()
        .describe(
          'Full-text search query. Searches across HN story titles, URLs, and authors. ' +
            'Supports multi-word queries (e.g. "rust programming language", "openai gpt").',
        ),
      type: z
        .enum(['story', 'comment', 'job', 'poll', 'ask', 'show'])
        .optional()
        .describe(
          'Content type filter. "story" = submitted links; "ask" = Ask HN threads; ' +
            '"show" = Show HN posts; "job" = job listings; "poll" = polls. Default: story.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe('Number of results to return (1–30, default 10).'),
      page: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Zero-based page index for pagination (default 0).'),
    })
    .strip(),

  'hnalgolia.search_recent': z
    .object({
      query: z
        .string()
        .describe(
          'Full-text search query sorted by submission date (newest first). ' +
            'Ideal for finding the latest HN discussions on a topic.',
        ),
      type: z
        .enum(['story', 'comment', 'job', 'poll', 'ask', 'show'])
        .optional()
        .describe(
          'Content type filter. "story" = submitted links; "ask" = Ask HN; ' +
            '"show" = Show HN; "job" = job listings. Default: story.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe('Number of results to return (1–30, default 10).'),
      page: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Zero-based page index for pagination (default 0).'),
    })
    .strip(),

  'hnalgolia.search_comments': z
    .object({
      query: z
        .string()
        .describe(
          'Search query to find comments across HackerNews history. Returns comment text, ' +
            'story context (title + URL), author, and direct HN link. ' +
            'Useful for finding community opinions or technical discussions.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe('Number of comments to return (1–30, default 10).'),
      page: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Zero-based page index for pagination (default 0).'),
    })
    .strip(),

  'hnalgolia.item_details': z
    .object({
      id: z
        .number()
        .int()
        .positive()
        .describe(
          'HackerNews item ID (positive integer). Works for stories, comments, ' +
            'Ask HN, Show HN, jobs, and polls. Example: 48713832.',
        ),
    })
    .strip(),

  'hnalgolia.user_profile': z
    .object({
      username: z
        .string()
        .min(1)
        .describe(
          'HackerNews username (case-sensitive). Returns karma score and about/bio text. ' +
            'Examples: "pg", "dang", "tptacek".',
        ),
    })
    .strip(),
};
