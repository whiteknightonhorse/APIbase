import { z } from 'zod';

export const hackernewsSchemas: Record<string, z.ZodTypeAny> = {
  'hackernews.top_stories': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe(
          'Number of top stories to return (1–20, default 10). Each story includes title, URL, score, and comment count.',
        ),
    })
    .strip(),

  'hackernews.new_stories': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe(
          'Number of newest stories to return (1–20, default 10). Sorted by submission time, most recent first.',
        ),
    })
    .strip(),

  'hackernews.best_stories': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe(
          'Number of best stories to return (1–20, default 10). HackerNews "best" feed: high-quality posts with strong upvotes and engagement.',
        ),
    })
    .strip(),

  'hackernews.item_details': z
    .object({
      id: z
        .number()
        .int()
        .positive()
        .describe(
          'HackerNews item ID (integer). Works for stories, comments, jobs, polls, and poll options. Example: 48713832',
        ),
    })
    .strip(),

  'hackernews.user_profile': z
    .object({
      username: z
        .string()
        .min(1)
        .describe(
          'HackerNews username (case-sensitive). Examples: "pg", "dang", "tptacek". Returns karma, account age, about text, and submission count.',
        ),
    })
    .strip(),
};
