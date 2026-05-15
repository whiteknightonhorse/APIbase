import { z, type ZodSchema } from 'zod';

/**
 * Lichess tool schemas (UC-416).
 *
 * All fields have .describe() per Smithery quality requirements.
 */

const PERF_TYPES = [
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'ultraBullet',
  'chess960',
  'crazyhouse',
  'antichess',
  'atomic',
  'horde',
  'kingOfTheHill',
  'racingKings',
  'threeCheck',
] as const;

export const lichessSchemas: Record<string, ZodSchema> = {
  'lichess.user_profile': z
    .object({
      username: z
        .string()
        .min(2)
        .max(30)
        .describe(
          'Lichess username (2–30 characters, lowercase letters, digits, and underscores). Example: "DrNykterstein".',
        ),
    })
    .strip(),

  'lichess.top_players': z
    .object({
      nb: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(10)
        .describe('Number of top players to return (1–200). Defaults to 10.'),
      perf_type: z
        .enum(PERF_TYPES)
        .describe(
          'Chess variant to rank players by. One of: bullet, blitz, rapid, classical, ultraBullet, chess960, crazyhouse, antichess, atomic, horde, kingOfTheHill, racingKings, threeCheck.',
        ),
    })
    .strip(),

  'lichess.daily_puzzle': z
    .object({
      _unused: z
        .string()
        .optional()
        .describe('Reserved for future filtering — not currently used.'),
    })
    .strip(),
};
