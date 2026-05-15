import { z } from 'zod';

/**
 * OpenDota tool schemas (UC-418).
 *
 * OpenDota — Dota 2 statistics API (https://docs.opendota.com/)
 * Every field has .describe() per Smithery quality requirements.
 */

export const opendotaSchemas: Record<string, z.ZodTypeAny> = {
  'opendota.player_summary': z
    .object({
      account_id: z
        .number()
        .int()
        .describe(
          'Steam account ID (Dota 2 32-bit). Get from /api/search?q=playername. Example: 105248644 (Dendi).',
        ),
    })
    .strip(),

  'opendota.player_matches': z
    .object({
      account_id: z
        .number()
        .int()
        .describe(
          'Steam account ID (Dota 2 32-bit). Get from /api/search?q=playername. Example: 105248644 (Dendi).',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Max matches to return (1-100, default 20).'),
    })
    .strip(),

  'opendota.match_detail': z
    .object({
      match_id: z.number().int().describe('Dota 2 match ID (64-bit integer from player_matches).'),
    })
    .strip(),

  'opendota.pro_teams': z
    .object({
      _unused: z
        .string()
        .optional()
        .describe('Reserved for future filtering — not currently used.'),
    })
    .strip(),
};
