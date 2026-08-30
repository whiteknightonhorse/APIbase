import { z, type ZodSchema } from 'zod';

// Verified live against GET /api/filter?tag=<value> — every value below returned HTTP 200
// with a non-empty result set. An unrecognized tag causes the upstream to return HTTP 500
// (not a clean 4xx), so this list is enum-constrained to keep bad input a client-side 400
// instead of a confusing "provider unavailable" error.
const TAG_VALUES = [
  'mmorpg',
  'shooter',
  'strategy',
  'moba',
  'racing',
  'sports',
  'social',
  'sandbox',
  'open-world',
  'survival',
  'pvp',
  'pve',
  'pixel',
  'voxel',
  'zombie',
  'turn-based',
  'first-person',
  'third-person',
  'top-down',
  'tank',
  'space',
  'sailing',
  'side-scroller',
  'superhero',
  'permadeath',
  'card',
  'battle-royale',
  'mmo',
  'mmofps',
  'mmotps',
  '3d',
  '2d',
  'anime',
  'fantasy',
  'sci-fi',
  'fighting',
  'action-rpg',
  'action',
  'military',
  'martial-arts',
  'flight',
  'low-spec',
  'tower-defense',
  'horror',
  'mmorts',
] as const;

const platform = z
  .enum(['pc', 'browser', 'all'])
  .optional()
  .describe('Platform filter: pc (Windows client), browser (web games), or all (default all)');

const sortBy = z
  .enum(['release-date', 'popularity', 'alphabetical', 'relevance'])
  .optional()
  .describe('Sort order for results (default relevance)');

const gameList = z
  .object({
    platform,
    category: z
      .enum(TAG_VALUES)
      .optional()
      .describe('Genre/category filter (e.g. mmorpg, shooter, battle-royale)'),
    sort_by: sortBy,
  })
  .strip();

const gameDetail = z
  .object({
    id: z.number().int().positive().describe('FreeToGame game ID (e.g. 540 for Overwatch)'),
  })
  .strip();

const filterByTag = z
  .object({
    tag: z
      .enum(TAG_VALUES)
      .describe('Genre/gameplay tag to filter by (e.g. mmorpg, pvp, anime, battle-royale)'),
    platform,
    sort_by: sortBy,
  })
  .strip();

export const freetogameSchemas: Record<string, ZodSchema> = {
  'freetogame.game_list': gameList,
  'freetogame.game_detail': gameDetail,
  'freetogame.filter_by_tag': filterByTag,
};
