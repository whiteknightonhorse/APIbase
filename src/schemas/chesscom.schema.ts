import { z, type ZodSchema } from 'zod';

/**
 * Chess.com Public Data API tool schemas (UC-417).
 *
 * All fields have .describe() per Smithery quality requirements.
 */

const CHESS_TITLES = ['GM', 'WGM', 'IM', 'WIM', 'FM', 'WFM', 'NM', 'WNM', 'CM', 'WCM'] as const;

export const chesscomSchemas: Record<string, ZodSchema> = {
  'chesscom.player_profile': z
    .object({
      username: z
        .string()
        .min(3)
        .max(25)
        .describe(
          'Chess.com username (3–25 characters; lowercase letters, digits, hyphens, and underscores only). Example: "hikaru", "magnuscarlsen".',
        ),
    })
    .strip(),

  'chesscom.player_stats': z
    .object({
      username: z
        .string()
        .min(3)
        .max(25)
        .describe(
          'Chess.com username (3–25 characters; lowercase letters, digits, hyphens, and underscores only). Example: "hikaru", "magnuscarlsen".',
        ),
    })
    .strip(),

  'chesscom.titled_players': z
    .object({
      title: z
        .enum(CHESS_TITLES)
        .describe(
          'Official chess title to filter by. GM = Grandmaster, WGM = Woman Grandmaster, IM = International Master, WIM = Woman International Master, FM = FIDE Master, WFM = Woman FIDE Master, NM = National Master, WNM = Woman National Master, CM = Candidate Master, WCM = Woman Candidate Master.',
        ),
    })
    .strip(),
};
