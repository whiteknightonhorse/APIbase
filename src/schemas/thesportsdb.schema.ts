import { z, type ZodSchema } from 'zod';

const teamSearch = z
  .object({
    name: z
      .string()
      .min(1)
      .describe(
        'Team name to search for (e.g. "Arsenal", "Lakers", "New England Patriots"). ' +
          'Partial names are supported.',
      ),
  })
  .strip();

const playerSearch = z
  .object({
    name: z
      .string()
      .min(1)
      .describe(
        'Player name to search for (e.g. "Harry Kane", "LeBron James"). ' +
          'Partial names are supported.',
      ),
  })
  .strip();

const eventsPast = z
  .object({
    league_id: z
      .string()
      .describe(
        'TheSportsDB league ID to retrieve past events for (e.g. "4328" for English Premier League, ' +
          '"4387" for NBA, "4391" for NFL). Obtain a league ID from team search results.',
      ),
  })
  .strip();

const eventsNext = z
  .object({
    league_id: z
      .string()
      .describe(
        'TheSportsDB league ID to retrieve upcoming events for (e.g. "4328" for English Premier League, ' +
          '"4387" for NBA, "4391" for NFL). Obtain a league ID from team search results.',
      ),
  })
  .strip();

export const thesportsdbSchemas: Record<string, ZodSchema> = {
  'thesportsdb.team_search': teamSearch,
  'thesportsdb.player_search': playerSearch,
  'thesportsdb.events_past': eventsPast,
  'thesportsdb.events_next': eventsNext,
};
