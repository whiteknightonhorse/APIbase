import { z, type ZodSchema } from 'zod';

const searchTweetsSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'X search query with operators such as from:username, #hashtag, quoted phrases, since:YYYY-MM-DD, until:YYYY-MM-DD',
      ),
    sort_order: z
      .enum(['latest', 'top'])
      .optional()
      .describe('Sort order: latest for chronological results, top for engagement-ranked results'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    since_time: z
      .string()
      .optional()
      .describe('ISO 8601 timestamp. Only return tweets after this time'),
    until_time: z
      .string()
      .optional()
      .describe('ISO 8601 timestamp. Only return tweets before this time'),
    limit: z.number().int().min(1).max(200).optional().describe('Maximum tweets to return'),
  })
  .strip();

const userSchema = z
  .object({
    username: z.string().optional().describe('X username without @, for example xquikcom'),
    user_id: z.string().optional().describe('X numeric user ID as an alternative to username'),
  })
  .strip();

const followersSchema = z
  .object({
    username: z.string().optional().describe('X username without @'),
    user_id: z.string().optional().describe('X numeric user ID as an alternative to username'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    page_size: z
      .number()
      .int()
      .min(20)
      .max(200)
      .optional()
      .describe('Users to request in one page'),
  })
  .strip();

const trendsSchema = z
  .object({
    woeid: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Where On Earth ID for the trend region. 1 is worldwide, 23424977 is US, 23424975 is UK',
      ),
    count: z.number().int().min(1).max(50).optional().describe('Number of trends to return'),
  })
  .strip();

export const xquikSchemas: Record<string, ZodSchema> = {
  'xquik.search_tweets': searchTweetsSchema,
  'xquik.user': userSchema,
  'xquik.followers': followersSchema,
  'xquik.trends': trendsSchema,
};
