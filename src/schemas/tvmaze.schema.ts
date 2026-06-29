import { z, type ZodSchema } from 'zod';

const showSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('TV show title to search for (e.g. "Breaking Bad", "Game of Thrones")'),
  })
  .strip();

const showDetails = z
  .object({
    id: z
      .number()
      .int()
      .positive()
      .describe('TVMaze show ID (e.g. 169 for Breaking Bad, 82 for Game of Thrones)'),
  })
  .strip();

const showEpisodes = z
  .object({
    id: z.number().int().positive().describe('TVMaze show ID (e.g. 169 for Breaking Bad)'),
    season: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Filter episodes to a specific season number (e.g. 1 for Season 1). Omit for all seasons.',
      ),
    specials: z
      .boolean()
      .optional()
      .describe('Include special episodes (e.g. holiday specials, bonus episodes). Default: false'),
  })
  .strip();

const showCast = z
  .object({
    id: z
      .number()
      .int()
      .positive()
      .describe('TVMaze show ID to retrieve cast and character information for'),
  })
  .strip();

const schedule = z
  .object({
    country: z
      .string()
      .length(2)
      .optional()
      .describe(
        'ISO 3166-1 alpha-2 country code for broadcast TV schedule (e.g. "US", "GB", "AU"). Omit for global.',
      ),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Schedule date in YYYY-MM-DD format (e.g. "2026-06-29"). Defaults to today.'),
    streaming: z
      .boolean()
      .optional()
      .describe(
        'If true, returns streaming/web channel schedule (Netflix, Hulu, etc.) instead of broadcast TV. Default: false',
      ),
  })
  .strip();

export const tvmazeSchemas: Record<string, ZodSchema> = {
  'tvmaze.show_search': showSearch,
  'tvmaze.show_details': showDetails,
  'tvmaze.show_episodes': showEpisodes,
  'tvmaze.show_cast': showCast,
  'tvmaze.schedule': schedule,
};
