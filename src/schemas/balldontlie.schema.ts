import { z, type ZodSchema } from 'zod';

const games = z
  .object({
    date: z
      .string()
      .optional()
      .describe('Game date (YYYY-MM-DD, e.g. "2026-03-29"). Returns all games on that date'),
    season: z.number().int().optional().describe('Season year (e.g. 2025 for 2025-26 season)'),
    team_id: z.number().int().optional().describe('Filter by team ID (get IDs from bdl.teams)'),
    sport: z
      .enum(['nba', 'nfl'])
      .optional()
      .default('nba')
      .describe('Sport league: "nba" (default) or "nfl"'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .default(10)
      .describe('Max results (1-25, default 10)'),
  })
  .strip();

const teams = z
  .object({
    conference: z
      .string()
      .optional()
      .describe('Filter by conference (e.g. "East", "West" for NBA; "AFC", "NFC" for NFL)'),
    division: z
      .string()
      .optional()
      .describe('Filter by division (e.g. "Atlantic", "Pacific" for NBA)'),
    sport: z
      .enum(['nba', 'nfl'])
      .optional()
      .default('nba')
      .describe('Sport league: "nba" (default) or "nfl"'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .default(30)
      .describe('Max results (1-30, default 30)'),
  })
  .strip();

const players = z
  .object({
    search: z
      .string()
      .optional()
      .describe('Search by player name (e.g. "lebron", "curry", "mahomes")'),
    team_id: z.number().int().optional().describe('Filter by team ID'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .default(10)
      .describe('Max results (1-25, default 10)'),
  })
  .strip();

export const balldontlieSchemas: Record<string, ZodSchema> = {
  'bdl.games': games,
  'bdl.teams': teams,
  'bdl.players': players,
};
