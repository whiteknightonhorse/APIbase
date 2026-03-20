import { z, type ZodSchema } from 'zod';

const footballFixtures = z.object({
  date: z.string().optional().describe('Date in YYYY-MM-DD format (e.g. "2026-03-20"). Returns all fixtures for that day.'),
  league: z.number().int().optional().describe('League ID (e.g. 39 = Premier League, 140 = La Liga, 78 = Bundesliga)'),
  season: z.number().int().optional().describe('Season year (e.g. 2025)'),
  team: z.number().int().optional().describe('Team ID to filter fixtures'),
  live: z.boolean().optional().describe('Set to true to get only live/in-play fixtures'),
}).strip();

const footballStandings = z.object({
  league: z.number().int().describe('League ID (e.g. 39 = Premier League, 140 = La Liga, 135 = Serie A)'),
  season: z.number().int().optional().describe('Season year (default: current season, e.g. 2025)'),
}).strip();

const footballLeagues = z.object({
  country: z.string().optional().describe('Country name to filter leagues (e.g. "England", "Spain", "Germany")'),
  search: z.string().optional().describe('Search league by name (e.g. "Premier", "Champions")'),
}).strip();

const basketballGames = z.object({
  date: z.string().optional().describe('Date in YYYY-MM-DD format. Returns all basketball games for that day.'),
  league: z.number().int().optional().describe('League ID (e.g. 12 = NBA)'),
  season: z.string().optional().describe('Season (e.g. "2025-2026")'),
  team: z.number().int().optional().describe('Team ID to filter games'),
}).strip();

export const apisportsSchemas: Record<string, ZodSchema> = {
  'sports.football_fixtures': footballFixtures,
  'sports.football_standings': footballStandings,
  'sports.football_leagues': footballLeagues,
  'sports.basketball_games': basketballGames,
};
