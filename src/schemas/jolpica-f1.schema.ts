import { z } from 'zod';

const seasonParam = z
  .union([z.string(), z.number()])
  .optional()
  .describe('Season year (e.g. 2026, 2024, 2023). Omit for the current season.');

const limitParam = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Maximum number of results to return (1–100, default 30).');

const offsetParam = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('Pagination offset — number of results to skip (default 0).');

export const jolpicaF1Schemas: Record<string, z.ZodSchema> = {
  'f1.races.schedule': z
    .object({
      season: seasonParam,
      limit: limitParam,
      offset: offsetParam,
    })
    .strip()
    .describe('Get the Formula 1 race calendar for a season.'),

  'f1.races.results': z
    .object({
      season: seasonParam,
      round: z
        .union([z.string(), z.number()])
        .optional()
        .describe(
          "Race round number within the season (1-based), or 'last' for the most recent completed race. Omit for last race.",
        ),
      limit: limitParam,
      offset: offsetParam,
    })
    .strip()
    .describe('Get finishing results for a specific Formula 1 race.'),

  'f1.standings.drivers': z
    .object({
      season: seasonParam,
      limit: limitParam,
      offset: offsetParam,
    })
    .strip()
    .describe('Get driver World Championship standings for a season.'),

  'f1.standings.constructors': z
    .object({
      season: seasonParam,
      limit: limitParam,
      offset: offsetParam,
    })
    .strip()
    .describe('Get constructor (team) World Championship standings for a season.'),
};
